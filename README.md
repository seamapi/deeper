# Deeper

## Introduction

Deeper is a command-line utility for managing your npm dependencies more intimately. It allows you to replace any installed npm dependency in your project with a symlinked, git-cloned, and self-built version of that dependency.

This is great for multi-repo development where you might want to quickly edit and PR for a dependency.

## Usage

Deeper is invoked from the command line as follows:

```bash
deeper <npm-dependency>
```

Replace `<npm-dependency>` with the name of the dependency you want to replace with a checked out and self-built version from the repository.

If a git repository for the dependency already exists in `~/.deeper/<npm-dependency>`, you will be asked if you want to update it and discard any local changes. The default answer is 'no'. If you choose to discard changes, they will be saved in a branch named `deeper-stash-<timestamp>`.

