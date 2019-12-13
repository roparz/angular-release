#! /usr/bin/env node

/**
 * Available .env options:
 * - GITHUB_OAUTH_TOKEN: Github token used to create Github release
 * - RELEASE_CANDIDATE_PREID: release candidate pre-id string (default: rc)
 * - ALLOW_RELEASE_CANDIDATE_TAG: Allow release candidate to create tag with the chosen version
 * - ALLOW_RELEASE_CANDIDATE_CHANGELOG: Allow release candidate to update changelog
 * - ALLOW_RELEASE_CANDIDATE_GH_RELEASE: Allow release candidate to create Github release
*/
"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var standardChangelog = require('standard-changelog');

var conventionalGithubReleaser = require('conventional-github-releaser');

var bump = require('bump-regex');

var inquirer = require('inquirer');

var fs = require('fs');

var childProcess = require('child_process');

var concatStream = require('concat-stream');

require('dotenv').config({
  path: "".concat(process.env.PWD, "/.env")
});

var PACKAGE_PATH = "".concat(process.env.PWD, "/package.json");
var CHANGELOG_PATH = "".concat(process.env.PWD, "/CHANGELOG.md");
var RC_PREID = process.env.RELEASE_CANDIDATE_PREID || 'rc';

function pcall(fn) {
  for (var _len = arguments.length, opts = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    opts[_key - 1] = arguments[_key];
  }

  return new Promise(function (resolve, reject) {
    opts.push(function (err, data) {
      if (err) reject(err);else resolve(data);
    });
    fn.apply(null, opts);
  });
}

function getAllVersions() {
  var opts = {
    str: fs.readFileSync(PACKAGE_PATH).toString()
  };
  var versions = {
    patchRc: null,
    patch: null,
    minorRc: null,
    minor: null,
    majorRc: null,
    major: null
  };
  var rc = null;
  return pcall(bump, Object.assign({
    type: 'prerelease',
    preid: RC_PREID
  }, opts)).then(function (patchRc) {
    versions.patchRc = patchRc;
    rc = patchRc["new"].split('-')[1];
    return pcall(bump, Object.assign({
      type: 'patch'
    }, opts));
  }).then(function (patch) {
    versions.patch = patch;
    return pcall(bump, Object.assign({
      type: 'minor'
    }, opts));
  }).then(function (minor) {
    versions.minor = minor;
    var minorRc = "".concat(minor["new"], "-").concat(rc);
    versions.minorRc = _objectSpread({}, minor, {
      str: minor.str.replace("\"version\": \"".concat(minor["new"], "\""), "\"version\": \"".concat(minorRc, "\"")),
      "new": minorRc,
      preid: RC_PREID
    });
    return pcall(bump, Object.assign({
      type: 'major'
    }, opts));
  }).then(function (major) {
    versions.major = major;
    var majorRc = "".concat(major["new"], "-").concat(rc);
    versions.majorRc = _objectSpread({}, major, {
      str: major.str.replace("\"version\": \"".concat(major["new"], "\""), "\"version\": \"".concat(majorRc, "\"")),
      "new": majorRc,
      preid: RC_PREID
    });
    return versions;
  });
}

function prompt(versions) {
  console.log("\nCurrent version is ".concat(versions.patch.prev, ".\n"));
  var patchRc = versions.patchRc,
      patch = versions.patch,
      minorRc = versions.minorRc,
      minor = versions.minor,
      majorRc = versions.majorRc,
      major = versions.major;
  var choices = [];

  if (patchRc["new"] !== minorRc["new"]) {
    choices.push({
      name: "rc-patch (".concat(patchRc["new"], ")"),
      value: patchRc
    });
  }

  if (patch["new"] !== minor["new"]) {
    choices.push({
      name: "patch (".concat(patch["new"], ")"),
      value: patch
    });
  }

  if (minorRc["new"] !== majorRc["new"]) {
    choices.push({
      name: "rc-minor (".concat(minorRc["new"], ")"),
      value: minorRc
    });
  }

  if (minor["new"] !== major["new"]) {
    choices.push({
      name: "minor (".concat(minor["new"], ")"),
      value: minor
    });
  }

  choices.push({
    name: "rc-major (".concat(majorRc["new"], ")"),
    value: majorRc
  }, {
    name: "major (".concat(major["new"], ")"),
    value: major
  }, {
    name: "cancel",
    value: null
  });
  return inquirer.prompt([{
    name: 'version',
    type: 'list',
    choices: choices,
    "default": choices[0].value,
    message: 'What kind of release is it?'
  }]).then(function (_ref) {
    var version = _ref.version;
    if (!version) process.exit(0);
    return version;
  });
}

function bumpVersion(version) {
  return pcall(fs.writeFile, PACKAGE_PATH, version.str).then(function () {
    return version;
  });
}

function changelog(version) {
  standardChangelog.createIfMissing(CHANGELOG_PATH);

  if (version.preid === RC_PREID && !process.env.ALLOW_RELEASE_CANDIDATE_CHANGELOG) {
    return version;
  }

  return new Promise(function (resolve, reject) {
    try {
      standardChangelog().pipe(concatStream({
        encoding: 'buffer'
      }, function (data) {
        try {
          var file = fs.readFileSync(CHANGELOG_PATH);
          fs.writeFileSync(CHANGELOG_PATH, Buffer.concat([data, file]));
          resolve(version);
        } catch (error) {
          reject(error);
        }
      }));
    } catch (error) {
      reject(error);
    }
  });
}

function gitCommit(version) {
  var cmd = ['git add package.json CHANGELOG.md', "git commit -a -m \"chore(release): v".concat(version["new"], "\"")].join(' && ');
  return pcall(childProcess.exec, cmd).then(function () {
    return version;
  });
}

function gitPush(version) {
  var cmd = 'git push';
  return pcall(childProcess.exec, cmd).then(function () {
    return version;
  });
}

function gitTag(version) {
  if (version.preid === RC_PREID && !process.env.ALLOW_RELEASE_CANDIDATE_TAG) {
    return version;
  }

  var cmd = ['git fetch --tags', "git tag ".concat(version["new"]), 'git push --tags'].join(' && ');
  return pcall(childProcess.exec, cmd).then(function () {
    return version;
  });
}

function githubRelease(version) {
  if (version.preid === RC_PREID && !process.env.ALLOW_RELEASE_CANDIDATE_GH_RELEASE) {
    return version;
  }

  if (!process.env.GITHUB_OAUTH_TOKEN) {
    console.log('Cannot run conventionalGithubReleaser. You must add a .env file with a GITHUB_OAUTH_TOKEN key');
    return version;
  }

  var GITHUB_AUTH = {
    type: 'oauth',
    token: process.env.GITHUB_OAUTH_TOKEN,
    url: 'https://api.github.com/'
  };
  return pcall(conventionalGithubReleaser, GITHUB_AUTH, {
    preset: 'angular'
  });
}

function notify(msg, optional) {
  return function (version) {
    if (optional && version.preid === RC_PREID) return version;
    console.log(msg.replace('$$version', version["new"]));
    return version;
  };
}

getAllVersions().then(prompt).then(notify('- Update package.json with version: $$version')).then(bumpVersion).then(notify('- Update changelog', !process.env.ALLOW_RELEASE_CANDIDATE_CHANGELOG)).then(changelog).then(notify('- git commit')).then(gitCommit).then(notify('- git push')).then(gitPush).then(notify('- git tag', !process.env.ALLOW_RELEASE_CANDIDATE_TAG)).then(gitTag).then(notify('- Github release', !process.env.ALLOW_RELEASE_CANDIDATE_GH_RELEASE)).then(githubRelease)["catch"](function (err) {
  return console.log(err);
});
