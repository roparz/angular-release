#! /usr/bin/env node
'use strict';

require('dotenv').config({ path: process.env.PWD + '/.env' });

var standardChangelog = require('standard-changelog'),
    conventionalGithubReleaser = require('conventional-github-releaser'),
    bump = require('bump-regex'),
    inquirer = require('inquirer'),
    fs = require('fs'),
    q = require('q'),
    exec = require('child_process').exec,
    concatStream = require('concat-stream');

var PACKAGE_PATH = process.env.PWD + '/package.json',
    CHANGELOG_PATH = process.env.PWD + '/CHANGELOG.md',
    RC_PREID = 'rc';

var VERSION = require(PACKAGE_PATH).version;

function get_all_versions() {
    var opts = {
        str: fs.readFileSync(PACKAGE_PATH).toString()
    };
    var sub_opts = {
        str: function () {
            if (VERSION.match(/-\d+$/)) return opts.str;
            return opts.str.replace(/"version":\s*".*",?/, '"version": "' + VERSION + '-0"');
        }()
    };
    return q.all([q.nfcall(bump, Object.assign({ type: 'prerelease', preid: RC_PREID }, opts)), q.nfcall(bump, Object.assign({ type: 'prerelease' }, sub_opts)), q.nfcall(bump, Object.assign({ type: 'patch' }, opts)), q.nfcall(bump, Object.assign({ type: 'minor' }, opts)), q.nfcall(bump, Object.assign({ type: 'major' }, opts))]).spread(function (rc, sub, patch, minor, major) {
        return { rc: rc, sub: sub, patch: patch, minor: minor, major: major };
    });
}

function prompt(versions) {
    return inquirer.prompt([{
        name: "version",
        type: "list",
        choices: [{
            name: 'sub-release (' + versions.sub.new + ')',
            value: versions.sub
        }, {
            name: 'release-candidate (' + versions.rc.new + ')',
            value: versions.rc
        }, {
            name: 'patch (' + versions.patch.new + ')',
            value: versions.patch
        }, {
            name: 'minor (' + versions.minor.new + ')',
            value: versions.minor
        }, {
            name: 'major (' + versions.major.new + ')',
            value: versions.major
        }],
        default: versions.patch,
        message: "What kind of release is it?"
    }]).then(function (answers) {
        return answers.version;
    });
}

function bump_version(version) {
    return q.nfcall(fs.writeFile, PACKAGE_PATH, version.str).then(function () {
        return version;
    });
}

function changelog(version) {
    if (version.preid === RC_PREID) return version;
    var defer = q.defer();
    standardChangelog.createIfMissing(CHANGELOG_PATH);
    var file = fs.readFileSync(CHANGELOG_PATH);
    standardChangelog().pipe(concatStream({ encoding: 'buffer' }, function (data) {
        fs.writeFileSync(CHANGELOG_PATH, Buffer.concat([data, file]));
        defer.resolve(version);
    }));

    return defer.promise;
}

function git_commit(version) {
    var defer = q.defer();
    exec(['git add package.json CHANGELOG.md', 'git commit -a -m "chore(release): v' + version.new + '"'].join(' && '), function (err) {
        if (err) return defer.reject(err);
        defer.resolve(version);
    });
    return defer.promise;
}

function git_push(version) {
    var defer = q.defer();
    exec('git push', function (err) {
        if (err) return defer.reject(err);
        defer.resolve(version);
    });
    return defer.promise;
}

function git_tag(version) {
    if (version.preid === RC_PREID) return version;
    var defer = q.defer();
    exec(['git tag ' + version.new, 'git push --tags'].join(' && '), function (err) {
        if (err) return defer.reject(err);
        defer.resolve(version);
    });
    return defer.promise;
}

function github_release(version) {
    if (version.preid === RC_PREID) return version;
    if (!process.env.GITHUB_OAUTH_TOKEN) {
        console.log('Cannot run conventionalGithubReleaser. You must add a .env file with a GITHUB_OAUTH_TOKEN key');
        return version;
    }
    var GITHUB_AUTH = {
        type: 'oauth',
        token: process.env.GITHUB_OAUTH_TOKEN
    };
    return q.nfcall(conventionalGithubReleaser, GITHUB_AUTH, { preset: 'angular' });
}

function notify(msg, optional) {
    return function (version) {
        if (optional && version.preid === RC_PREID) return version;
        console.log(msg.replace('$$version', version.new));
        return version;
    };
}

get_all_versions().then(prompt).then(notify('- Update package.json with version: $$version')).then(bump_version).then(notify('- Update changelog', true)).then(changelog).then(notify('- git commit')).then(git_commit).then(notify('- git push')).then(git_push).then(notify('- git tag', true)).then(git_tag).then(notify('- Github release', true)).then(github_release).catch(function (err) {
    return console.log(err);
});