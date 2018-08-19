/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

const fs = require('fs');
const os = require('os');
const packageData = require('./package.json');
const prodName = `${packageData.name} (GitHub) version ${packageData.version}`;

console.log(`${prodName}${os.EOL}(c) 2018 JSolisU. MIT License.${os.EOL}`);
const options = require('yargs')
  .usage('Usage: $0 [options]')
  .alias('o', 'org')
  .describe('o', 'Organization')
  .alias('u', 'usr')
  .describe('u', 'GitHub username')
  .alias('p', 'pwd')
  .describe('p', 'GitHub password')
  .alias('t', 'token')
  .describe('t', 'GitHub token (-u and -p parameters are useless)')
  .alias('d', 'dest')
  .describe('d', 'Destination path (-d <path>)')
  .alias('c', 'clean')
  .describe('c', 'Clean destination path')
  .alias('l', 'log')
  .describe('l', 'Generate log')
  .alias('z', 'zip')
  .describe('z', 'Compress backup to <path> + <file>.7z (if file is $ then use default filename.7z)')
  .config('settings', (configPath) => {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  })
  .help('h')
  .demandOption(['o'])
  .argv;

const octokit = require('@octokit/rest')();

const childProcess = require('child_process');
const rimraf = require('rimraf');
const path = require('path');
const commandExists = require('command-exists');

const moment = require('moment');

let logFile = null;

function fixPath (pathToFix) {
  if (process.platform === 'win32') {
    return pathToFix.replace(/\\/g, '\\\\');
  } else {
    return pathToFix;
  }
}

let rootPath = fixPath(process.cwd());

function checkForGit () {
  return commandExists('git')
    .catch(() => {
      return Promise.reject(new Error('Git not found.'));
    });
}

function setRootPath () {
  return new Promise((resolve, reject) => {
    if (options.dest) {
      if (fs.existsSync(options.dest)) {
        rootPath = fixPath(options.dest);
        resolve(rootPath);
      } else {
        reject(new Error(`Path <${options.dest}> not found.`));
      }
    } else {
      resolve(rootPath);
    }
  });
}

function authenticate () {
  return new Promise((resolve, reject) => {
    try {
      if (!options.token) {
        if (!options.usr || !options.pwd) {
          throw new Error('Basic authentication requires both user and password parameters.');
        }
        octokit.authenticate({
          type: 'basic',
          username: options.usr,
          password: options.pwd
        });
      } else {
        octokit.authenticate({
          type: 'oauth',
          token: options.token
        });
      }

      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function getUserInfo () {
  return new Promise((resolve, reject) => {
    octokit.users.get({}, (error, result) => {
      if (error) {
        reject(new Error(`getUserInfo: ${error}`));
      } else {
        console.log(`Welcome ${result.data.name}${os.EOL}`);
        resolve(result);
      }
    });
  });
}

function getOrgInfo () {
  return new Promise((resolve, reject) => {
    octokit.orgs.get({org: options.org}, (error, result) => {
      if (error) {
        reject(new Error(`getOrgInfo: ${error}`));
      } else {
        console.log(`Info for [${result.data.login}] organization:`);
        console.log(`* Description: ${result.data.description}`);
        console.log(`* Url: ${result.data.html_url}`);
        console.log(`* Total private repositories: ${result.data.total_private_repos}`);
        console.log(`* Plan: ${result.data.plan.name}`);
        console.log(`* Plan seats: ${result.data.plan.seats}`);
        console.log(`* Plan filled seats: ${result.data.plan.filled_seats}`);
        console.log(`* Default repository permission: ${result.data.default_repository_permission}`);
        console.log(`* Members can create repositories: ${result.data.members_can_create_repositories}`);
        console.log(' ');
        resolve(result);
      }
    });
  });
}

function cleanDestination () {
  if (options.dest && options.clean) {
    try {
      console.log('Deleting log file...');
      fs.unlinkSync(path.join(rootPath, 'github_clone_all_org.log'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`cleanDestination: ${error}`);
      }
    }

    fs.readdir(rootPath, function (err, files) {
      if (!err) {
        files.map(function (file) {
          return path.join(rootPath, file);
        }).filter(function (file) {
          return fs.statSync(file).isDirectory();
        }).forEach(function (file) {
          console.log(`Deleting path <${file}>...`);
          rimraf.sync(file);
        });
      }
    });
  }
}

/* Log File: Begin */
function startLog () {
  if (options.log) {
    logFile = fs.openSync(path.join(rootPath, 'github_clone_all_org.log'), 'w');

    sendToLog(`${prodName} Log${os.EOL}`);
  }
}

function sendToLog (s) {
  if (options.log) {
    fs.writeSync(logFile, `${s}${os.EOL}`);
  }
}

function endLog () {
  if (options.log) {
    fs.closeSync(logFile);
  }
}

/* Log File: End */

function getRepositories () {
  return new Promise((resolve, reject) => {
    cleanDestination();

    startLog();

    octokit.repos.getForOrg({org: options.org, per_page: 100}, (error, result) => {
      if (error) {
        reject(new Error(`getRepositories: ${error}`));
      } else {
        console.log(`${os.EOL}Repositories (${result.data.length}):${os.EOL}`);
        let p = Promise.resolve();
        result.data.forEach(repository => {
          p = p.then(() => new Promise(resolve => {
            octokit.repos.getBranches({owner: options.org, repo: repository.name, per_page: 100}, (error, result) => {
              if (error) {
                // TODO
              } else {
                result.data.forEach(branch => {
                  console.log(`${repository.name} => ${repository.html_url} (${branch.name})`);

                  let repoURL;
                  if (!options.token) {
                    // basic
                    repoURL = `https://${options.usr}:${options.pwd}@github.com/${options.org}/${repository.name}.git`;
                  } else {
                    // oauth
                    repoURL = `https://${options.token}@github.com/${options.org}/${repository.name}.git`;
                  }

                  let destPath = path.join(rootPath, `${options.org}_${repository.name}_${branch.name}`);

                  // cleanup branch
                  rimraf.sync(destPath);

                  childProcess.execFileSync('git', ['clone', repoURL, destPath], {
                    env: process.env
                  });

                  // If the branch is master, it is already cloned
                  process.chdir(destPath);
                  if (branch.name !== 'master') {
                    childProcess.execFileSync('git', ['checkout', branch.name], {
                      env: process.env
                    });
                  }

                  // Generate log
                  if (options.log) {
                    const commitsHours = 12;

                    sendToLog('=====>');
                    sendToLog(`Repository: ${repository.full_name} / Branch: ${branch.name}`);

                    sendToLog(`Last commits (in the last ${commitsHours} hours):`);

                    let output = childProcess.execFileSync('git', ['log', '-100', '--pretty=format:%cn,%cI']).toString().split('\n');

                    let timeStamp = new Date(Date.now());
                    timeStamp.setHours(timeStamp.getHours() - commitsHours);

                    let count = 0;
                    output.forEach(commitItem => {
                      let data = commitItem.split(',');

                      if (new Date(data[1]) >= timeStamp) {
                        sendToLog(`${data[0]}@${data[1]}`);
                        count++;
                      }
                    });

                    if (count === 0) {
                      sendToLog(`No commits.`);
                    }
                    sendToLog('');
                  }

                  process.chdir(rootPath);
                });
              }
              resolve();
            });
          }));
        });
        p.then(() => {
          sendToLog(`Total repositories: ${result.data.length}.`);
          sendToLog('');
          endLog();
          resolve(result.headers);
        });
      }
    });
  });
}

function compressBackup () {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      if (options.zip) {
        let destFile;
        let defaultFile = `git${moment(new Date()).format('YYYYMMDD')}.7z`;

        if (options.zip === 'true') {
          destFile = path.join(rootPath, defaultFile);
        } else {
          if (path.basename(options.zip) === '$') {
            destFile = path.join(path.dirname(options.zip), defaultFile);
          } else {
            destFile = options.zip;
          }
        }

        try {
          console.log('Deleting compressed backup file...');
          fs.unlinkSync(destFile);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            reject(new Error(`compressBackup: ${error}`));
          }
        }

        console.log(`Compressing to <${destFile}>...`);
        try {
          childProcess.execFileSync('7z', ['a', '-mx9', '-t7z', destFile, rootPath]);
        } catch (error) {
          reject(new Error(`compressBackup: ${error}`));
        }
      }
      resolve();
    } else {
      reject(new Error('compressBackup: Not supported.'));
    }
  });
}

(() => {
  checkForGit()
    .then(() => setRootPath())
    .then(() => authenticate())
    .then(() => getUserInfo())
    .then(() => getOrgInfo())
    .then(() => getRepositories())
    .then(() => compressBackup())
    .then(() => console.log('Done.'))
    .catch(error => console.log(error.message));
})();
