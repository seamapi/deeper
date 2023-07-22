#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const chalk = require('chalk');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const moment = require('moment');
const cwd = process.cwd();

const argv = yargs(hideBin(process.argv))
    .command('<npm-dependency>', 'replace a package with a symlink to a git repo')
    .help()
    .argv;

const dep = argv._[0];

if (!dep) {
    console.log(chalk.red('Please provide a valid npm dependency'));
    process.exit(1);
}

const nodeModulesPath = path.join(cwd, 'node_modules', dep);
const pkgPath = path.join(nodeModulesPath, 'package.json');
const gitPath = path.join(process.env.HOME, '.deeper', dep);

if (!fs.existsSync(pkgPath)) {
    console.log(chalk.red(`Could not find ${dep} in node_modules`));
    process.exit(1);
}

const pkg = require(pkgPath);

if (!pkg.repository || !pkg.repository.url) {
    console.log(chalk.red(`Could not find repository url for ${dep}`));
    process.exit(1);
}

console.log(chalk.green(`Found repository url for ${dep}: ${pkg.repository.url}`));

if (!fs.existsSync(gitPath)) {
    console.log(chalk.green(`Cloning ${pkg.repository.url} to ${gitPath}`));
    child_process.execSync(`git clone ${pkg.repository.url} ${gitPath}`);
} else {
    console.log(chalk.yellow(`Repository for ${dep} already exists at ${gitPath}`));
    console.log(chalk.yellow(`Would you like to update it and discard any changes? (default: no)`));
    const response = process.stdin.readline();
    if (response.toLowerCase().startsWith('y')) {
        console.log(chalk.green(`Stashing changes and updating ${dep}`));
        const timestamp = moment().format('YYYY-MM-DD-hh-mm');
        child_process.execSync(`cd ${gitPath} && git stash save "deeper-stash-${timestamp}" && git pull`);
    }
}

console.log(chalk.green(`Building ${dep}`));
child_process.execSync(`cd ${gitPath} && npm install && npm run build`);

console.log(chalk.green(`Creating symlink from ${nodeModulesPath} to ${gitPath}`));
fs.unlinkSync(nodeModulesPath);
fs.symlinkSync(gitPath, nodeModulesPath, 'dir');

console.log(chalk.green(`Done!`));

