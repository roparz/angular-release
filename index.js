#! /usr/bin/env node

/**
 * Available .env options:
 * - GITHUB_OAUTH_TOKEN: Github token used to create Github release
 * - ENABLE_RELEASE_CANDIDATE: Enable release candidate feature
 * - RELEASE_CANDIDATE_PREID: release candidate pre-id string (default: rc)
 * - ALLOW_RELEASE_CANDIDATE_TAG: Allow release candidate to create tag with the chosen version
 * - ALLOW_RELEASE_CANDIDATE_CHANGELOG: Allow release candidate to update changelog
 * - ALLOW_RELEASE_CANDIDATE_GH_RELEASE: Allow release candidate to create Github release
*/

const standardChangelog = require('standard-changelog')
const conventionalGithubReleaser = require('conventional-github-releaser')
const bump = require('bump-regex')
const inquirer = require('inquirer')
const fs = require('fs')
const childProcess = require('child_process')
const concatStream = require('concat-stream')

require('dotenv').config({ path: `${process.env.PWD}/.env` })

const PACKAGE_PATH = `${process.env.PWD}/package.json`
const CHANGELOG_PATH = `${process.env.PWD}/CHANGELOG.md`

const GH_OAUTH_TOKEN = process.env.GITHUB_OAUTH_TOKEN
const RC_ENABLED = process.env.ENABLE_RELEASE_CANDIDATE === 'true'
const ALLOW_RC_TAG = process.env.ALLOW_RELEASE_CANDIDATE_TAG === 'true'
const ALLOW_RC_CHANGELOG = process.env.ALLOW_RELEASE_CANDIDATE_CHANGELOG === 'true'
const ALLOW_RC_GH_RELEASE = process.env.ALLOW_RELEASE_CANDIDATE_GH_RELEASE === 'true'
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
  const versions = {
    patchRc: null,
    patch: null,
    minorRc: null,
    minor: null,
    majorRc: null,
    major: null
  }
  let rc = null
  return pcall(bump, Object.assign({ type: 'prerelease', preid: RC_PREID }, opts))
    .then(patchRc => {
      if (RC_ENABLED) versions.patchRc = patchRc
      rc = patchRc.new.split('-')[1]
      return pcall(bump, Object.assign({ type: 'patch' }, opts))
    })
    .then(patch => {
      versions.patch = patch
      return pcall(bump, Object.assign({ type: 'minor' }, opts))
    })
    .then(minor => {
      versions.minor = minor
      if (RC_ENABLED) {
        const minorRc = `${minor.new}-${rc}`
        versions.minorRc = {
          ...minor,
          str: minor.str.replace(`"version": "${minor.new}"`, `"version": "${minorRc}"`),
          new: minorRc,
          preid: RC_PREID
        }
      }
      return pcall(bump, Object.assign({ type: 'major' }, opts))
    })
    .then(major => {
      versions.major = major
      if (RC_ENABLED) {
        const majorRc = `${major.new}-${rc}`
        versions.majorRc = {
          ...major,
          str: major.str.replace(`"version": "${major.new}"`, `"version": "${majorRc}"`),
          new: majorRc,
          preid: RC_PREID
        }
      }
      return versions
    })
}

function prompt (versions) {
  console.log(`\nCurrent version is ${versions.patch.prev}.\n`)

  const { patchRc, patch, minorRc, minor, majorRc, major } = versions
  const choices = []

  if (patchRc && patchRc.new !== minorRc.new) {
    choices.push({
      name: `rc-patch (${patchRc.new})`,
      value: patchRc
    })
  }

  if (patch.new !== minor.new) {
    choices.push({
      name: `patch (${patch.new})`,
      value: patch
    })
  }

  if (minorRc && minorRc.new !== majorRc.new) {
    choices.push({
      name: `rc-minor (${minorRc.new})`,
      value: minorRc
    })
  }

  if (minor.new !== major.new) {
    choices.push({
      name: `minor (${minor.new})`,
      value: minor
    })
  }

  if (majorRc) {
    choices.push({
      name: `rc-major (${majorRc.new})`,
      value: majorRc
    })
  }

  choices.push(
    {
      name: `major (${major.new})`,
      value: major
    },
    {
      name: `cancel`,
      value: null
    }
  )

  return inquirer.prompt([
    {
      name: 'version',
      type: 'list',
      choices,
      default: choices[0].value,
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
  if (version.preid === RC_PREID && !ALLOW_RC_CHANGELOG) {
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
  if (version.preid === RC_PREID && !ALLOW_RC_TAG) {
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
  if (version.preid === RC_PREID && !ALLOW_RC_GH_RELEASE) {
    return version
  }
  if (!GH_OAUTH_TOKEN) {
    console.log('Cannot run conventionalGithubReleaser. You must add a .env file with a GITHUB_OAUTH_TOKEN key')
    return version
  }
  const GITHUB_AUTH = {
    type: 'oauth',
    token: GH_OAUTH_TOKEN,
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
  .then(notify('- Update changelog', !ALLOW_RC_CHANGELOG))
  .then(changelog)
  .then(notify('- git commit'))
  .then(gitCommit)
  .then(notify('- git push'))
  .then(gitPush)
  .then(notify('- git tag', !ALLOW_RC_TAG))
  .then(gitTag)
  .then(notify('- Github release', !ALLOW_RC_GH_RELEASE))
  .then(githubRelease)
  .catch((err) => console.log(err))
