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
"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
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
var GH_OAUTH_TOKEN = process.env.GITHUB_OAUTH_TOKEN;
var RC_ENABLED = process.env.ENABLE_RELEASE_CANDIDATE === 'true';
var ALLOW_RC_TAG = process.env.ALLOW_RELEASE_CANDIDATE_TAG === 'true';
var ALLOW_RC_CHANGELOG = process.env.ALLOW_RELEASE_CANDIDATE_CHANGELOG === 'true';
var ALLOW_RC_GH_RELEASE = process.env.ALLOW_RELEASE_CANDIDATE_GH_RELEASE === 'true';
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
    if (RC_ENABLED) versions.patchRc = patchRc;
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
    if (RC_ENABLED) {
      var minorRc = "".concat(minor["new"], "-").concat(rc);
      versions.minorRc = _objectSpread({}, minor, {
        str: minor.str.replace("\"version\": \"".concat(minor["new"], "\""), "\"version\": \"".concat(minorRc, "\"")),
        "new": minorRc,
        preid: RC_PREID
      });
    }
    return pcall(bump, Object.assign({
      type: 'major'
    }, opts));
  }).then(function (major) {
    versions.major = major;
    if (RC_ENABLED) {
      var majorRc = "".concat(major["new"], "-").concat(rc);
      versions.majorRc = _objectSpread({}, major, {
        str: major.str.replace("\"version\": \"".concat(major["new"], "\""), "\"version\": \"".concat(majorRc, "\"")),
        "new": majorRc,
        preid: RC_PREID
      });
    }
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
  if (patchRc && patchRc["new"] !== minorRc["new"]) {
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
  if (minorRc && minorRc["new"] !== majorRc["new"]) {
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
  if (majorRc) {
    choices.push({
      name: "rc-major (".concat(majorRc["new"], ")"),
      value: majorRc
    });
  }
  choices.push({
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
  if (version.preid === RC_PREID && !ALLOW_RC_CHANGELOG) {
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
  if (version.preid === RC_PREID && !ALLOW_RC_TAG) {
    return version;
  }
  var cmd = ['git fetch --tags', "git tag ".concat(version["new"]), 'git push --tags'].join(' && ');
  return pcall(childProcess.exec, cmd).then(function () {
    return version;
  });
}
function githubRelease(version) {
  if (version.preid === RC_PREID && !ALLOW_RC_GH_RELEASE) {
    return version;
  }
  if (!GH_OAUTH_TOKEN) {
    console.log('Cannot run conventionalGithubReleaser. You must add a .env file with a GITHUB_OAUTH_TOKEN key');
    return version;
  }
  var GITHUB_AUTH = {
    type: 'oauth',
    token: GH_OAUTH_TOKEN,
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
getAllVersions().then(prompt).then(notify('- Update package.json with version: $$version')).then(bumpVersion).then(notify('- Update changelog', !ALLOW_RC_CHANGELOG)).then(changelog).then(notify('- git commit')).then(gitCommit).then(notify('- git push')).then(gitPush).then(notify('- git tag', !ALLOW_RC_TAG)).then(gitTag).then(notify('- Github release', !ALLOW_RC_GH_RELEASE)).then(githubRelease)["catch"](function (err) {
  return console.log(err);
});
