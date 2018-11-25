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

var _standardChangelog = _interopRequireDefault(require("standard-changelog"));

var _conventionalGithubReleaser = _interopRequireDefault(require("conventional-github-releaser"));

var _bumpRegex = _interopRequireDefault(require("bump-regex"));

var _inquirer = _interopRequireDefault(require("inquirer"));

var _fs = _interopRequireDefault(require("fs"));

var _child_process = _interopRequireDefault(require("child_process"));

var _concatStream = _interopRequireDefault(require("concat-stream"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

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
    str: _fs.default.readFileSync(PACKAGE_PATH).toString()
  };
  return Promise.all([pcall(_bumpRegex.default, Object.assign({
    type: 'prerelease',
    preid: RC_PREID
  }, opts)), pcall(_bumpRegex.default, Object.assign({
    type: 'patch'
  }, opts)), pcall(_bumpRegex.default, Object.assign({
    type: 'minor'
  }, opts)), pcall(_bumpRegex.default, Object.assign({
    type: 'major'
  }, opts))]).then(function (_ref) {
    var _ref2 = _slicedToArray(_ref, 4),
        rc = _ref2[0],
        patch = _ref2[1],
        minor = _ref2[2],
        major = _ref2[3];

    return {
      rc: rc,
      patch: patch,
      minor: minor,
      major: major
    };
  });
}

function prompt(versions) {
  return _inquirer.default.prompt([{
    name: 'version',
    type: 'list',
    choices: [{
      name: "release-candidate (".concat(versions.rc.new, ")"),
      value: versions.rc
    }, {
      name: "patch (".concat(versions.patch.new, ")"),
      value: versions.patch
    }, {
      name: "minor (".concat(versions.minor.new, ")"),
      value: versions.minor
    }, {
      name: "major (".concat(versions.major.new, ")"),
      value: versions.major
    }, {
      name: "cancel",
      value: null
    }],
    default: versions.patch,
    message: 'What kind of release is it?'
  }]).then(function (_ref3) {
    var version = _ref3.version;
    if (!version) process.exit(0);
    return version;
  });
}

function bumpVersion(version) {
  return pcall(_fs.default.writeFile, PACKAGE_PATH, version.str).then(function () {
    return version;
  });
}

function changelog(version) {
  _standardChangelog.default.createIfMissing(CHANGELOG_PATH);

  if (version.preid === RC_PREID && !process.env.ALLOW_RELEASE_CANDIDATE_CHANGELOG) {
    return version;
  }

  return new Promise(function (resolve, reject) {
    try {
      (0, _standardChangelog.default)().pipe((0, _concatStream.default)({
        encoding: 'buffer'
      }, function (data) {
        try {
          var file = _fs.default.readFileSync(CHANGELOG_PATH);

          _fs.default.writeFileSync(CHANGELOG_PATH, Buffer.concat([data, file]));

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
  var cmd = ['git add package.json CHANGELOG.md', "git commit -a -m \"chore(release): v".concat(version.new, "\"")].join(' && ');
  return pcall(_child_process.default.exec, cmd).then(function () {
    return version;
  });
}

function gitPush(version) {
  var cmd = 'git push';
  return pcall(_child_process.default.exec, cmd).then(function () {
    return version;
  });
}

function gitTag(version) {
  if (version.preid === RC_PREID && !process.env.ALLOW_RELEASE_CANDIDATE_TAG) {
    return version;
  }

  var cmd = ['git fetch --tags', "git tag ".concat(version.new), 'git push --tags'].join(' && ');
  return pcall(_child_process.default.exec, cmd).then(function () {
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
    token: process.env.GITHUB_OAUTH_TOKEN
  };
  return pcall(_conventionalGithubReleaser.default, GITHUB_AUTH, {
    preset: 'angular'
  });
}

function notify(msg, optional) {
  return function (version) {
    if (optional && version.preid === RC_PREID) return version;
    console.log(msg.replace('$$version', version.new));
    return version;
  };
}

getAllVersions().then(prompt).then(notify('- Update package.json with version: $$version')).then(bumpVersion).then(notify('- Update changelog', !process.env.ALLOW_RELEASE_CANDIDATE_CHANGELOG)).then(changelog).then(notify('- git commit')).then(gitCommit).then(notify('- git push')).then(gitPush).then(notify('- git tag', !process.env.ALLOW_RELEASE_CANDIDATE_TAG)).then(gitTag).then(notify('- Github release', !process.env.ALLOW_RELEASE_CANDIDATE_GH_RELEASE)).then(githubRelease).catch(function (err) {
  return console.log(err);
});
