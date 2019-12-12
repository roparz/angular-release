#! /usr/bin/env node

/**
 * Available .env options:
 * - GITHUB_OAUTH_TOKEN: Github token used to create Github release
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
      versions.patchRc = patchRc
      rc = patchRc.new.split('-')[1]
      return pcall(bump, Object.assign({ type: 'patch' }, opts))
    })
    .then(patch => {
      versions.patch = patch
      return pcall(bump, Object.assign({ type: 'minor' }, opts))
    })
    .then(minor => {
      versions.minor = minor
      const minorRc = `${minor.new}-${rc}`
      versions.minorRc = {
        ...minor,
        str: minor.str.replace(`"version": "${minor.new}"`, `"version": "${minorRc}"`),
        new: minorRc
      }
      return pcall(bump, Object.assign({ type: 'major' }, opts))
    })
    .then(major => {
      versions.major = major
      const majorRc = `${major.new}-${rc}`
      versions.majorRc = {
        ...major,
        str: major.str.replace(`"version": "${major.new}"`, `"version": "${majorRc}"`),
        new: majorRc
      }
      return versions
    })
}

function prompt (versions) {
  return inquirer.prompt([
    {
      name: 'version',
      type: 'list',
      choices: [
        {
          name: `rc-patch (${versions.patchRc.new})`,
          value: versions.patchRc
        },
        {
          name: `patch (${versions.patch.new})`,
          value: versions.patch
        },
        {
          name: `rc-minor (${versions.minorRc.new})`,
          value: versions.minorRc
        },
        {
          name: `minor (${versions.minor.new})`,
          value: versions.minor
        },
        {
          name: `rc-major (${versions.majorRc.new})`,
          value: versions.majorRc
        },
        {
          name: `major (${versions.major.new})`,
          value: versions.major
        },
        {
          name: `cancel`,
          value: null
        }
      ],
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
