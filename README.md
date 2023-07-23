# Deeper

## Introduction

Deeper is a command-line utility for managing your npm dependencies more intimately. It allows you to replace any installed npm dependency in your project with a linked, git-cloned, and self-built version of that dependency.

This is great for multi-repo development where you might want to quickly edit and PR for a dependency.

The typical usage flow is:

1. Find issue with `<dep>`
2. Run `deeper <dep>`
3. Make some changes in `.deeper/<dep>`
4. Run `deeper sync`
5. Test Changes (repeat 3-4 as needed)

## Installation

`deeper` should be installed as a global dependency

```bash
npm install -g @seveibar/deeper
```

## Usage

Deeper is invoked from the command line as follows:

```bash
deeper <npm-dependency>
```

Replace `<npm-dependency>` with the name of the dependency you want to replace with a checked out and self-built version from the repository.

If a git repository for the dependency already exists in `~/.deeper/<npm-dependency>`, you will be asked if you want to update it and discard any local changes. The default answer is 'no'. If you choose to discard changes, they will be saved in a branch named `deeper-stash-<timestamp>`.

### Re-syncing

Run `deeper sync` to build and sync all the packages inside `.deeper`

### Cleaning Up

Run `deeper clean` to make everything tidy again.

> NOTE: The .deeper directory is left behind to avoid ever losing your changes,
> but is automatically added to `.gitignore`
