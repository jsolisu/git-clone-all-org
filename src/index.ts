/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

import fs = require('fs');
import os = require('os');
import * as yargs from 'yargs';

import * as packageData from '../package.json';

// tslint:disable-next-line:no-var-requires
const octokit = require('@octokit/rest')();
// tslint:disable-next-line:no-var-requires
const childProcess = require('child_process');
// tslint:disable-next-line:no-var-requires
const rimraf = require('rimraf');
// tslint:disable-next-line:no-var-requires
const path = require('path');
// tslint:disable-next-line:no-var-requires
const commandExists = require('command-exists');
// tslint:disable-next-line:no-var-requires
const moment = require('moment');

const prodName = `${(packageData as any).name} (GitHub) version ${(packageData as any).version}`;
console.log(`${prodName}${os.EOL}(c) 2018 JSolisU. MIT License.${os.EOL}`);

const options = yargs
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
  .config('settings', (configPath: string) => {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  })
  .help('h')
  .demandOption(['o']).argv;

let logFile: number;

function fixPath(pathToFix: string) {
  if (process.platform === 'win32') {
    return pathToFix.replace(/\\/g, '\\\\');
  } else {
    return pathToFix;
  }
}

let rootPath = fixPath(process.cwd());

function checkForGit() {
  return commandExists('git').catch(() => {
    return Promise.reject(new Error('Git not found.'));
  });
}

function setRootPath() {
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

function authenticate() {
  return new Promise((resolve, reject) => {
    if (!options.token) {
      if (!options.usr || !options.pwd) {
        reject(new Error('Basic authentication requires both user and password parameters.'));
      }
      octokit.authenticate({
        password: options.pwd,
        type: 'basic',
        username: options.usr,
      });
    } else {
      octokit.authenticate({
        token: options.token,
        type: 'oauth',
      });
    }
    resolve();
  });
}

function getUserInfo() {
  return octokit.users
    .get({})
    .then((result: any) => {
      console.log(`Welcome ${result.data.name}${os.EOL}`);
    })
    .catch((error: any) => {
      throw new Error(`getUserInfo: ${error}`);
    });
}

function getOrgInfo() {
  return octokit.orgs
    .get({ org: options.org })
    .then((result: any) => {
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
    })
    .catch((error: any) => {
      throw new Error(`getOrgInfo: ${error}`);
    });
}

function cleanDestination() {
  if (options.dest && options.clean) {
    try {
      console.log('Deleting log file...');
      fs.unlinkSync(path.join(rootPath, 'github_clone_all_org.log'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`cleanDestination: ${error}`);
      }
    }

    fs.readdir(rootPath, (err, files) => {
      if (!err) {
        files
          .map(file => {
            return path.join(rootPath, file);
          })
          .filter(file => {
            return fs.statSync(file).isDirectory();
          })
          .forEach(file => {
            console.log(`Deleting path <${file}>...`);
            rimraf.sync(file);
          });
      }
    });
  }
}

/* Log File: Begin */
function startLog() {
  if (options.log) {
    logFile = fs.openSync(path.join(rootPath, 'github_clone_all_org.log'), 'w');

    sendToLog(`${prodName} Log${os.EOL}`);
  }
}

function sendToLog(s: string) {
  if (options.log) {
    fs.writeSync(logFile, `${s}${os.EOL}`);
  }
}

function endLog() {
  if (options.log) {
    fs.closeSync(logFile);
  }
}

/* Log File: End */

function getRepositories() {
  return new Promise((resolve, reject) => {
    cleanDestination();

    startLog();

    octokit.repos.getForOrg({ org: options.org, per_page: 100 }, (error: any, result: any) => {
      if (error) {
        reject(new Error(`getRepositories: ${error}`));
      } else {
        console.log(`${os.EOL}Repositories (${result.data.length}):${os.EOL}`);
        let p = Promise.resolve();
        result.data.forEach((repository: any) => {
          
          p = p.then(
            () =>
              // tslint:disable-next-line:no-shadowed-variable
              new Promise<void>(resolve => {
                octokit.repos.getBranches(
                  { owner: options.org, repo: repository.name, per_page: 100 },
                  // tslint:disable-next-line:no-shadowed-variable
                  (error: any, result: any) => {
                    if (error) {
                      // TODO
                    } else {
                      result.data.forEach((branch: any) => {
                        console.log(`${repository.name} => ${repository.html_url} (${branch.name})`);

                        let repoURL;
                        if (!options.token) {
                          // basic
                          repoURL = `https://${options.usr}:${options.pwd}@github.com/${options.org}/${
                            repository.name
                          }.git`;
                        } else {
                          // oauth
                          repoURL = `https://${options.token}@github.com/${options.org}/${repository.name}.git`;
                        }

                        const destPath = path.join(rootPath, `${options.org}_${repository.name}_${branch.name}`);

                        // cleanup branch
                        rimraf.sync(destPath);

                        childProcess.execFileSync('git', ['clone', repoURL, destPath], {
                          env: process.env,
                        });

                        // If the branch is master, it is already cloned
                        process.chdir(destPath);
                        if (branch.name !== 'master') {
                          childProcess.execFileSync('git', ['checkout', branch.name], {
                            env: process.env,
                          });
                        }

                        // Generate log
                        if (options.log) {
                          const commitsHours = 12;

                          sendToLog('=====>');
                          sendToLog(`Repository: ${repository.full_name} / Branch: ${branch.name}`);

                          sendToLog(`Last commits (in the last ${commitsHours} hours):`);

                          const output = childProcess
                            .execFileSync('git', ['log', '-100', '--pretty=format:%cn,%cI'])
                            .toString()
                            .split('\n');

                          const timeStamp = new Date(Date.now());
                          timeStamp.setHours(timeStamp.getHours() - commitsHours);

                          let count = 0;
                          output.forEach((commitItem: any) => {
                            const data = commitItem.split(',');

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
                  },
                );
              }),
          );
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

function compressBackup() {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      if (options.zip) {
        let destFile;
        const defaultFile = `git${moment(new Date()).format('YYYYMMDD')}.7z`;

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
    .catch((error: any) => console.log(error.message));
})();
