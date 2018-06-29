/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

console.log(`github-clone-all-org (GitHub) version ${require('./package.json').version}\n\r(c) 2018 JSolisU. MIT License.\n\r`);
const options = require('yargs')
  .usage('Usage: $0 [options]')
  .alias('o', 'org')
  .describe('o', 'Organization')
  .alias('u', 'usr')
  .describe('u', 'GitHub username')
  .alias('p', 'pwd')
  .describe('p', 'GitHub password')
  .alias('d', 'dest')
  .describe('d', 'Destination path (-d "c:\\temp")')
  .alias('c', 'clean')
  .describe('c', 'Clean destination path')
  .alias('l', 'log')
  .describe('l', 'Generate log')
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

const ghorg = client.org(options.org);

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
        console.log(`Welcome ${body.name}\n\r`);
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
        console.log(`Info for [${data.login}] organization:`);
        console.log(`* Description: ${data.description}`);
        console.log(`* Url: ${data.html_url}`);
        console.log(`* Total private repositories: ${data.total_private_repos}`);
        console.log(`* Plan: ${data.plan.name}`);
        console.log(`* Plan seats: ${data.plan.seats}`);
        console.log(`* Plan filled seats: ${data.plan.filled_seats}`);
        console.log(`* Default repository permission: ${data.default_repository_permission}`);
        console.log(`* Members can create repositories: ${data.members_can_create_repositories}`);
        console.log('\n\r');
        resolve(data);
      }
    });
  });
}

function getRepositories () {
  const logFile = path.join(rootPath, 'github_clone_all_org.log');

  return new Promise((resolve, reject) => {
    let file;
    if (options.log) {
      file = fs.openSync(logFile, 'w');
    }

    // Clean destination path?
    if (options.dest && options.clean) {
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

    ghorg.repos((err, data, header) => {
      if (err) {
        reject(new Error(`getRepositories: ${err}`));
      } else {
        console.log('\n\rRepositories:\n\r');
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
                    let res = childProcess.execFileSync('git', ['log', '-1', '--pretty=format:%cI,%an,%ae,%s,%b']).toString().split(',');
                    fs.writeSync(file, `Repository: ${repository.name}, Branch: ${branch.name}, Last commit: ${new Date(res[0]).toString()} by -${res[1]}-, Subject: -${res[3]}-, Body: -${res[4]}-\n\r`);
                  }

                  process.chdir(rootPath);
                });
              }
              resolve();
            });
          }));
        });
        p.then(() => {
          if (options.log) {
            fs.closeSync(file);
          }
          resolve(data);
        });
      }
    });
  });
}

(() => {
  checkForGit()
    .then(() => setRootPath())
    .then(() => getUserInfo())
    .then(() => getOrgInfo())
    .then(() => getRepositories())
    .then(() => console.log('Done.'))
    .catch(error => console.log(error.message));
})();
