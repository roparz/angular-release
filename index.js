#! /usr/bin/env node

/**
 * Available .env options:
 * - GITHUB_OAUTH_TOKEN: Github token used to create Github release
 * - RELEASE_CANDIDATE_PREID: release candidate pre-id string (default: rc)
 * - ALLOW_RELEASE_CANDIDATE_TAG: Allow release candidate to create tag with the chosen version
 * - ALLOW_RELEASE_CANDIDATE_CHANGELOG: Allow release candidate to update changelog
 * - ALLOW_RELEASE_CANDIDATE_GH_RELEASE: Allow release candidate to create Github release
*/

import standardChangelog from 'standard-changelog'
import conventionalGithubReleaser from 'conventional-github-releaser'
import bump from 'bump-regex'
import inquirer from 'inquirer'
import fs from 'fs'
import childProcess from 'child_process'
import concatStream from 'concat-stream'

require('dotenv').config({ path: `${process.env.PWD}/.env` })

const PACKAGE_PATH = `${process.env.PWD}/package.json`
const CHANGELOG_PATH = `${process.env.PWD}/CHANGELOG.md`
const RC_PREID = process.env.RELEASE_CANDIDATE_PREID || 'rc'

function pcall (fn, ...opts) {
  return new Promise((resolve, reject) => {
    opts.push((err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
    fn.apply(null, opts)
  })
}

function getAllVersions () {
  const opts = {
    str: fs.readFileSync(PACKAGE_PATH).toString()
  }
  return Promise.all([
    pcall(bump, Object.assign({ type: 'prerelease', preid: RC_PREID }, opts)),
    pcall(bump, Object.assign({ type: 'patch' }, opts)),
    pcall(bump, Object.assign({ type: 'minor' }, opts)),
    pcall(bump, Object.assign({ type: 'major' }, opts))
  ])
    .then(([rc, patch, minor, major]) => {
      return { rc, patch, minor, major }
    })
}

function prompt (versions) {
  return inquirer.prompt([
    {
      name: 'version',
      type: 'list',
      choices: [{
        name: `release-candidate (${versions.rc.new})`,
        value: versions.rc
      }, {
        name: `patch (${versions.patch.new})`,
        value: versions.patch
      }, {
        name: `minor (${versions.minor.new})`,
        value: versions.minor
      }, {
        name: `major (${versions.major.new})`,
        value: versions.major
      }, {
        name: `cancel`,
        value: null
      }],
      default: versions.patch,
      message: 'What kind of release is it?'
    }
  ])
    .then(({ version }) => {
      if (!version) process.exit(0)
      return version
    })
}

function bumpVersion (version) {
  return pcall(fs.writeFile, PACKAGE_PATH, version.str)
    .then(() => version)
}

function changelog (version) {
  standardChangelog.createIfMissing(CHANGELOG_PATH)
  if (version.preid === RC_PREID && !process.env.ALLOW_RELEASE_CANDIDATE_CHANGELOG) {
    return version
  }
  return new Promise((resolve, reject) => {
    try {
      standardChangelog()
        .pipe(concatStream({ encoding: 'buffer' }, (data) => {
          try {
            const file = fs.readFileSync(CHANGELOG_PATH)
            fs.writeFileSync(CHANGELOG_PATH, Buffer.concat([data, file]))
            resolve(version)
          } catch (error) {
            reject(error)
          }
        }))
    } catch (error) {
      reject(error)
    }
  })
}

function gitCommit (version) {
  const cmd = [
    'git add package.json CHANGELOG.md',
    `git commit -a -m "chore(release): v${version.new}"`
  ].join(' && ')
  return pcall(childProcess.exec, cmd)
    .then(() => version)
}

function gitPush (version) {
  const cmd = 'git push'
  return pcall(childProcess.exec, cmd)
    .then(() => version)
}

function gitTag (version) {
  if (version.preid === RC_PREID && !process.env.ALLOW_RELEASE_CANDIDATE_TAG) {
    return version
  }
  const cmd = [
    'git fetch --tags',
    `git tag ${version.new}`,
    'git push --tags'
  ].join(' && ')
  return pcall(childProcess.exec, cmd)
    .then(() => version)
}

function githubRelease (version) {
  if (version.preid === RC_PREID && !process.env.ALLOW_RELEASE_CANDIDATE_GH_RELEASE) {
    return version
  }
  if (!process.env.GITHUB_OAUTH_TOKEN) {
    console.log('Cannot run conventionalGithubReleaser. You must add a .env file with a GITHUB_OAUTH_TOKEN key')
    return version
  }
  const GITHUB_AUTH = {
    type: 'oauth',
    token: process.env.GITHUB_OAUTH_TOKEN,
    url: 'https://api.github.com/'
  }
  return pcall(conventionalGithubReleaser, GITHUB_AUTH, { preset: 'angular' })
}

function notify (msg, optional) {
  return (version) => {
    if (optional && version.preid === RC_PREID) return version
    console.log(msg.replace('$$version', version.new))
    return version
  }
}

getAllVersions()
  .then(prompt)
  .then(notify('- Update package.json with version: $$version'))
  .then(bumpVersion)
  .then(notify('- Update changelog', !process.env.ALLOW_RELEASE_CANDIDATE_CHANGELOG))
  .then(changelog)
  .then(notify('- git commit'))
  .then(gitCommit)
  .then(notify('- git push'))
  .then(gitPush)
  .then(notify('- git tag', !process.env.ALLOW_RELEASE_CANDIDATE_TAG))
  .then(gitTag)
  .then(notify('- Github release', !process.env.ALLOW_RELEASE_CANDIDATE_GH_RELEASE))
  .then(githubRelease)
  .catch((err) => console.log(err))
