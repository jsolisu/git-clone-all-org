/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

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
  .alias('d', 'dest')
  .describe('d', 'Destination path (-d <path>)')
  .alias('c', 'clean')
  .describe('c', 'Clean destination path')
  .alias('l', 'log')
  .describe('l', 'Generate log')
  .alias('z', 'zip')
  .describe('z', 'Compress backup to <path> + <file>.7z (if file is $ then use default filename.7z)')
  .help('h')
  .demandOption(['o', 'u', 'p'])
  .argv;

const github = require('octonode');
const client = github.client({
  username: options.usr,
  password: options.pwd
});
const childProcess = require('child_process');
const rimraf = require('rimraf');
const path = require('path');
const fs = require('fs');
const commandExists = require('command-exists');

const moment = require('moment');

const ghorg = client.org(options.org);
ghorg.extra = {
  info: null,
  members: null
};

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

function getUserInfo () {
  return new Promise((resolve, reject) => {
    client.get('/user', {}, function (err, status, body, headers) {
      if (err) {
        reject(new Error(`getUserInfo: ${err}`));
      } else {
        console.log(`Welcome ${body.name}${os.EOL}`);
        resolve(body);
      }
    });
  });
}

function getOrgInfo () {
  return new Promise((resolve, reject) => {
    ghorg.info((err, data, header) => {
      if (err) {
        reject(new Error(`getOrgInfo: ${err}`));
      } else {
        ghorg.extra.info = data;
        console.log(`Info for [${data.login}] organization:`);
        console.log(`* Description: ${data.description}`);
        console.log(`* Url: ${data.html_url}`);
        console.log(`* Total private repositories: ${data.total_private_repos}`);
        console.log(`* Plan: ${data.plan.name}`);
        console.log(`* Plan seats: ${data.plan.seats}`);
        console.log(`* Plan filled seats: ${data.plan.filled_seats}`);
        console.log(`* Default repository permission: ${data.default_repository_permission}`);
        console.log(`* Members can create repositories: ${data.members_can_create_repositories}`);
        console.log(' ');
        resolve(data);
      }
    });
  });
}

function getOrgMembers () {
  return new Promise((resolve, reject) => {
    ghorg.members((err, data) => {
      if (err) {
        reject(new Error(`getOrgMembers: ${err}`));
      } else {
        ghorg.extra.members = data;
        resolve(data);
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

    ghorg.repos((err, data, header) => {
      if (err) {
        reject(new Error(`getRepositories: ${err}`));
      } else {
        console.log(`${os.EOL}Repositories (${data.length}):${os.EOL}`);
        let p = Promise.resolve();
        data.forEach(repository => {
          p = p.then(() => new Promise(resolve => {
            let ghrepo = client.repo(`${options.org}/${repository.name}`);
            ghrepo.branches((err, data, header) => {
              if (err) {
                // TODO
              } else {
                data.forEach(branch => {
                  console.log(`${repository.name} => ${repository.html_url} (${branch.name})`);
                  let repoURL = `https://${options.usr}:${options.pwd}@github.com/${options.org}/${repository.name}.git`;
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
                      data = commitItem.split(',');

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
          sendToLog(`Total repositories: ${data.length}.`);
          sendToLog('');
          endLog();
          resolve(data);
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
    .then(() => getUserInfo())
    .then(() => getOrgInfo())
    .then(() => getOrgMembers())
    .then(() => getRepositories())
    .then(() => compressBackup())
    .then(() => console.log('Done.'))
    .catch(error => console.log(error.message));
})();
