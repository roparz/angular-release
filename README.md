# Angular Release

A tool to builds releases based on [Angular conventional changelog preset](https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-changelog-angular/convention.md) (inspired by Gulp "Automate release workflow" recipe).

## Install

```
npm i --save-dev angular-release
```

## Usage

```
node_modules/.bin/angular-release
```

*Compatibility mode for old node versions*

```
node_modules/.bin/angular-release-es5
```

## How it works?

- ask the kind of release you want to do (see screenshot below)
  - `sub-release`
  - `release-candidate`
  - `patch`
  - `minor`
  - `major`
- update your `package.json` file
- create and update `CHANGELOG.md` (unless you choosed `release-candidate`)
- commit `chore(release): vX.Y.Z`
- push
- tag (unless you choosed `release-candidate`)
- create Github Release (unless you choosed `release-candidate` and only if `GITHUB_OAUTH_TOKEN` environment variable is passed to node)

## Github Release

To create a Github Release you must add the `GITHUB_OAUTH_TOKEN` environment variable. There is two way to do it :
- create a `.env` file with `GITHUB_OAUTH_TOKEN` variable
- set the environment variable before running the script: `GITHUB_OAUTH_TOKEN=xxx node_modules/.bin/angular-release`

## Screenshot

<img width="399" alt="screen shot 2017-09-24 at 10 53 32" src="https://user-images.githubusercontent.com/204520/30780963-d6494e6e-a116-11e7-9a5d-c037145033c8.png">
