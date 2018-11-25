[<img alt="npm version" src="https://img.shields.io/npm/v/angular-release.svg"/>](https://www.npmjs.com/package/angular-release)

# Angular Release

A script to build releases based on [Angular conventional changelog preset](https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-changelog-angular/convention.md) (inspired by Gulp "Automate release workflow" recipe).

## Install

```
npm i --save-dev angular-release
# or
yarn add -D angular-release
```

## Usage

```
node_modules/.bin/angular-release
```

## How it works

- you choose the kind of release you want to do (see screenshot below)
  - `release-candidate`
  - `patch`
  - `minor`
  - `major`
- the script will update your `package.json` file
- create or update `CHANGELOG.md` (unless you choosed `release-candidate`)
- commit `chore(release): vX.Y.Z`
- push
- tag (unless you choosed `release-candidate`)
- and finally create a Github Release (unless you choosed `release-candidate` and only if `GITHUB_OAUTH_TOKEN` environment variable is passed to node)

## Github Release

To create a Github Release you must add the `GITHUB_OAUTH_TOKEN` environment variable. There is two way to do it :
- create a `.env` file with `GITHUB_OAUTH_TOKEN` variable
- set the environment variable before running the script: `GITHUB_OAUTH_TOKEN=xxx node_modules/.bin/angular-release`


## All available env options:

- `GITHUB_OAUTH_TOKEN`: Github token used to create Github release
- `RELEASE_CANDIDATE_PREID`: release candidate pre-id string (default: rc)
- `ALLOW_RELEASE_CANDIDATE_TAG`: Allow release candidate to create tag with the chosen version
- `ALLOW_RELEASE_CANDIDATE_CHANGELOG`: Allow release candidate to update changelog
- `ALLOW_RELEASE_CANDIDATE_GH_RELEASE`: Allow release candidate to create Github release

## Screenshot

<img width="399" alt="angular release" src="https://user-images.githubusercontent.com/204520/48980172-07cf0a00-f0c6-11e8-8ec6-43b63375690d.png">
