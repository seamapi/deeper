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

async function main() {
  const chalk = (await import("chalk")).default
  const argv = yargs(hideBin(process.argv))
    .command(
      "<npm-dependency>",
      "replace a package with a symlink to a git repo",
    )
    .command("clean", "clean out all cloned deeper packages in node_modules")
    .help().argv

  const dep = argv._[0]

  // TODO remove "clean", it's the same as "npm install" basically
  if (dep === "clean") {
    console.log(
      chalk.green(`Cleaning out all cloned deeper packages in node_modules...`),
    )
    const nodeModulesDir = path.join(cwd, "node_modules")
    const deeperDir = path.join(process.env.HOME, ".deeper")

    let foundAtleastOne = false
    fs.readdirSync(nodeModulesDir).forEach((file) => {
      const filePath = path.join(nodeModulesDir, file)
      if (fs.lstatSync(filePath).isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(filePath)
        if (linkTarget.startsWith(deeperDir)) {
          console.log(chalk.green(`Removing symlink ${filePath}`))
          foundAtleastOne = true
          fs.unlinkSync(filePath)
        }
      }
    })

    if (!foundAtleastOne) {
      console.log(chalk.yellow(`No deeper packages found in node_modules`))
      return
    }

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

  const nodeModulesPath = path.join(cwd, "node_modules", dep)
  const pkgPath = path.join(nodeModulesPath, "package.json")
  const gitPath = path.join(process.env.HOME, ".deeper", dep)

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

  let gitUrl = pkg.repository.url

  // If the repository url is just "<org>/<repo>", make it a proper github url
  if (!gitUrl.includes("://")) {
    gitUrl = `git@github.com:${gitUrl}`
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
      child_process.execSync(
        `cd ${gitPath} && git stash save "${stashName}" && git pull`,
      )
    }
    rl.close()
  }

  console.log(chalk.green(`Installing ${dep}`))
  child_process.execSync(`cd ${gitPath} && npm install`)
  if (pkg.scripts?.build) {
    console.log(chalk.green(`Building ${dep}`))
    child_process.execSync(`cd ${gitPath} && npm run build`)
  }

  console.log(
    chalk.green(`Creating symlink from ${nodeModulesPath} to ${gitPath}`),
  )
  rimraf.sync(nodeModulesPath)
  fs.symlinkSync(gitPath, nodeModulesPath, "dir")

  console.log(chalk.green(`Done!`))
}

main()
