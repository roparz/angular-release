require('dotenv').config({ path: `${ process.env.PWD }/.env` })

const standardChangelog = require('standard-changelog')
    , conventionalGithubReleaser = require('conventional-github-releaser')
    , bump = require('bump-regex')
    , inquirer = require('inquirer')
    , fs = require('fs')
    , q = require('q')
    , exec = require('child_process').exec
    , concatStream = require('concat-stream')

const PACKAGE_PATH = `${ process.env.PWD }/package.json`
    , CHANGELOG_PATH = `${ process.env.PWD }/CHANGELOG.md`
    , RC_PREID = 'rc'

function get_all_versions() {
    const opts = {
        str: fs.readFileSync(PACKAGE_PATH).toString()
    }
    return q.all([
        q.nfcall(bump, Object.assign({ type: 'prerelease', preid: RC_PREID }, opts)),
        q.nfcall(bump, Object.assign({ type: 'prerelease' }, opts)),
        q.nfcall(bump, Object.assign({ type: 'patch' }, opts)),
        q.nfcall(bump, Object.assign({ type: 'minor' }, opts)),
        q.nfcall(bump, Object.assign({ type: 'major'}, opts))
    ])
    .spread(function(rc, sub, patch, minor, major) {
        return { rc, sub, patch, minor, major }
    })
}

function prompt(versions) {
    return inquirer.prompt([
        {
            name: "version",
            type: "list",
            choices: [{
                name: `release-candidate (${ versions.rc.new })`,
                value: versions.rc
            }, {
                name: `sub-release (${ versions.sub.new })`,
                value: versions.sub
            }, {
                name: `patch (${ versions.patch.new })`,
                value: versions.patch
            }, {
                name: `minor (${ versions.minor.new })`,
                value: versions.minor
            }, {
                name: `major (${ versions.major.new })`,
                value: versions.major
            }],
            default: versions.patch,
            message: "What kind of release is it?"
        }
    ])
    .then(function(answers) { return answers.version })
}

function bump_version(version) {
    return q.nfcall(fs.writeFile, PACKAGE_PATH, version.str)
    .then(function() { return version })
}

function changelog(version) {
    if (version.preid === RC_PREID) return version
    let defer = q.defer()
    let file = fs.readFileSync(CHANGELOG_PATH)
    standardChangelog.createIfMissing()
    standardChangelog()
        .pipe(concatStream({ encoding: 'buffer'}, function(data) {
            fs.writeFileSync(CHANGELOG_PATH, Buffer.concat([data, file]))
            defer.resolve(version)
        }))

    return defer.promise
}

function git_commit(version) {
    let defer = q.defer()
    exec([
        'git add package.json CHANGELOG.md',
        `git commit -a -m "chore(release): v${ version.new }"`
    ].join(' && '), function(err) {
        if (err) return defer.reject(err)
        defer.resolve(version)
    })
    return defer.promise
}

function git_push(version) {
    let defer = q.defer()
    exec('git push', function(err) {
        if (err) return defer.reject(err)
        defer.resolve(version)
    })
    return defer.promise
}

function git_tag(version) {
    if (version.preid === RC_PREID) return version
    let defer = q.defer()
    exec([
        `git tag ${ version.new }`,
        'git push --tags'
    ].join(' && '), function(err) {
        if (err) return defer.reject(err)
        defer.resolve(version)
    })
    return defer.promise
}

function github_release(version) {
    if (version.preid === RC_PREID) return version
    if (!process.env.GITHUB_AUTH_TOKEN) {
        console.log('Cannot run conventionalGithubReleaser. You must add a .env file with a GITHUB_AUTH_TOKEN key')
        return version
    }
    const GITHUB_AUTH = {
        type: 'oauth',
        token: process.env.GITHUB_AUTH_TOKEN
    }
    return q.nfcall(conventionalGithubReleaser, GITHUB_AUTH, { preset: 'angular' })
}

get_all_versions()
.then(prompt)
.then(bump_version)
.then(changelog)
.then(git_commit)
.then(git_push)
.then(git_tag)
// .then(github_release)
.catch(function(err) {
    console.log(err)
})
