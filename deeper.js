#!/usr/bin/env node
const fs = require("fs")
const path = require("path")
const child_process = require("child_process")
const yargs = require("yargs/yargs")
const { hideBin } = require("yargs/helpers")
const moment = require("moment")
const cwd = process.cwd()
const readline = require("readline")
const rimraf = require("rimraf")
const storage = require("node-persist")

async function exec(...args) {
  const chalk = (await import("chalk")).default
  console.log(chalk.gray(`> ${args[0]}`))
  child_process.execSync(...args)
}

function addToGitignore(file) {
  const gitignorePath = path.join(cwd, ".gitignore")
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, "utf8")
    if (!gitignore.includes(file)) {
      fs.appendFileSync(gitignorePath, `\n${file}`)
    }
  } else {
    fs.writeFileSync(gitignorePath, `${file}\n`)
  }
}

// Function to prompt the user
function promptUser(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === "y")
    })
  })
}

async function isHuskyInstalled() {
  try {
    // Attempt to list the version of husky
    // If husky is not installed, this command will throw an error
    await exec("npx --no husky -v", { stdio: "ignore" })
    return true
  } catch {
    // If the command throws an error, husky is not installed
    return false
  }
}

async function main() {
  const chalk = (await import("chalk")).default
  const argv = yargs(hideBin(process.argv))
    .command(
      "<npm-dependency>",
      "replace a package with a symlink to a git repo",
    )
    .command("sync", "build and sync all packages in .deeper to this project")
    .command("clean", "clean out all cloned deeper packages in node_modules")
    .help().argv

  const deeperDir = path.join(cwd, ".deeper")
  await storage.init({ dir: path.join(deeperDir, ".config") })
  const nodeModulesDir = path.join(cwd, "node_modules")

  if (!fs.existsSync(deeperDir)) {
    console.log(
      chalk.yellow(
        "No .deeper directory, this may be your first time running deeper in this project",
      ),
    )
    if (!(await isHuskyInstalled())) {
      if (
        await promptUser(
          "Husky is not installed globally. Would you like to make sure this project does not get yalc links accidentally committed and install husky? (y/n) ",
        )
      ) {
        await exec("npx husky install")
      }
    }
    if (!fs.existsSync(path.join(cwd, ".husky"))) {
      if (await promptUser(`Install the "yalc check" precommit hook?`)) {
        await exec(`npx husky add .husky/pre-commit "yalc check"`)
        await exec(`git add .husky/pre-commit`)
        await exec(`git commit -m "added husky to check for yalc issues"`)
      }
    }
    fs.mkdirSync(deeperDir, { recursive: true })
  }

  const dep = argv._[0]

  const syncList = (await storage.getItem("synclist")) ?? []

  if (dep === "sync") {
    console.log(
      chalk.green(
        `Syncing ${syncList
          .map((s) => `.deeper/${s}`)
          .join(",")} to this project...`,
      ),
    )

    if (!fs.existsSync(deeperDir)) {
      console.log(chalk.red("No .deeper directory found"))
      process.exit(1)
    }

    if (syncList.length === 0) {
      console.log(
        chalk.red(
          `Sync list is empty (try "deeper <package>" to add to the sync list)`,
        ),
      )
      process.exit(1)
    }

    const deeperDirFiles = fs.readdirSync(deeperDir)
    const scopedPackageFiles = []
    for (const fileOrDir of deeperDirFiles) {
      if (fileOrDir === ".config") continue
      const deeperPackageJson = path.join(fileOrDir, "package.json")
      if (!fs.existsSync(deeperPackageJson)) {
        scopedPackageFiles.push(
          ...fs
            .readdirSync(path.join(deeperDir, fileOrDir))
            .map((p) => path.join(fileOrDir, p)),
        )
      }
    }
    deeperDirFiles.push(...scopedPackageFiles)

    for (const file of deeperDirFiles) {
      const deeperPackageDir = path.join(deeperDir, file)
      const deeperPackageJson = path.join(deeperPackageDir, "package.json")

      if (fs.existsSync(deeperPackageJson)) {
        if (!syncList.includes(file)) {
          console.log(chalk.gray(`Skipping ${file} (not in synclist)`))
          continue
        }
        console.log(chalk.green(`Syncing ${file}`))

        const pkg = require(deeperPackageJson)

        console.log(chalk.green(`Installing ${file}`))
        await exec(`cd ${deeperPackageDir} && npm install`)

        if (pkg.scripts?.build) {
          console.log(chalk.green(`Building ${file}`))
          await exec(`cd ${deeperPackageDir} && npm run build`)
        }

        console.log(
          chalk.gray(`Adding the "${file}" to this project via yalc...`),
        )
        await exec(`cd ${deeperPackageDir} && yalc publish`)
        await exec(`yalc add ${file}`)

        console.log(chalk.green(`Done syncing ${file}!`))
      }
    }
    return
  } else if (dep === "clean") {
    console.log(
      chalk.green(`Cleaning out all cloned deeper packages in node_modules...`),
    )

    child_process.execSync("yalc remove --all")
    await storage.removeItem("synclist")

    console.log(
      chalk.green(`Running npm install to restore original packages...`),
    )
    child_process.execSync("npm install")
    console.log(chalk.green(`Done!`))

    return
  }

  if (!dep) {
    console.log(chalk.red("Please provide a valid npm dependency"))
    process.exit(1)
  }

  addToGitignore(".deeper")
  addToGitignore(".yalc")
  addToGitignore("yalc.lock")

  const nodeModulePath = path.join(nodeModulesDir, dep)
  const pkgPath = path.join(nodeModulePath, "package.json")
  const gitPath = path.join(deeperDir, dep)

  if (!fs.existsSync(pkgPath)) {
    console.log(chalk.red(`Could not find ${dep} in node_modules`))
    process.exit(1)
  }

  const pkg = require(pkgPath)

  if (!pkg.repository) {
    console.log(chalk.red(`Could not find repository url for ${dep}`))
    process.exit(1)
  }

  if (typeof pkg.repository === "string") {
    pkg.repository = { url: pkg.repository }
  }

  let gitUrl: string = pkg.repository.url

  // If the repository url is just "<org>/<repo>", make it a proper github url
  if (gitUrl.match(/^[^/]+\/[^/]+$/)) {
    gitUrl = `git@github.com:${gitUrl}`
  }

  if (gitUrl.startsWith("https://github.com")) {
    gitUrl = gitUrl.replace("https://github.com/", "git@github.com:")
  }

  console.log(chalk.green(`Found repository url for ${dep}: ${gitUrl}`))

  if (!fs.existsSync(gitPath)) {
    console.log(chalk.green(`Cloning ${gitUrl} to ${gitPath}`))
    child_process.execSync(`git clone ${gitUrl} ${gitPath}`)
  } else {
    console.log(
      chalk.yellow(`Repository for ${dep} already exists at ${gitPath}`),
    )
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    const answer = await new Promise((resolve) =>
      rl.question(
        `Would you like to update it, stashing old changes? (default: no)\n`,
        (answer) => resolve(answer),
      ),
    )
    if (answer.toLowerCase().startsWith("y")) {
      const timestamp = moment().format("YYYY-MM-DD-hh-mm")
      const stashName = `deeper-stash-${timestamp}`
      console.log(
        chalk.green(`Stashing changes to "${stashName}" and updating ${dep}`),
      )
      console.log(
        chalk.gray(
          `Restore previous changes with 'git stash apply "${stashName}"'`,
        ),
      )
      await exec(`cd ${gitPath} && git stash save "${stashName}"`)
      // TODO get the remote head with: git remote show origin | grep 'HEAD branch'
      await exec(`cd ${gitPath} && git fetch && git checkout origin/main`)
    }
    rl.close()
  }

  console.log(chalk.green(`Installing ${dep}`))
  await exec(`cd ${gitPath} && npm install`)
  if (pkg.scripts?.build) {
    console.log(chalk.green(`Building ${dep}`))
    await exec(`cd ${gitPath} && npm run build`)
  }

  console.log(chalk.gray(`Adding the "${dep}" to this project via yalc...`))
  await exec(`cd ${gitPath} && yalc publish`)
  await exec(`yalc add ${dep}`)

  if (!syncList.includes(dep))
    await storage.setItem("synclist", [...syncList, dep])

  console.log(chalk.green(`Done!`))

  console.log(
    chalk.green(
      `\nRun "deeper sync" to sync your packages!\nEdit the package in ".deeper/${dep}"\n`,
    ),
  )
}

main()
