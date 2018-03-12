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
  .describe('d', 'Destination path')
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

let rootPath = process.cwd();

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
        rootPath = options.dest;
        resolve(options.dest);
      } else {
        reject(new Error(`Path <${options.dest}> not found.`));
      }
    }
  });
}

function getUserInfo () {
  return new Promise((resolve, reject) => {
    client.get('/user', {}, function (err, status, body, headers) {
      if (err) {
        reject(new Error('User not found.'));
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
        reject(new Error('Organization not found.'));
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
        resolve(data);
      }
    });
  });
}

function getRepositories () {
  return new Promise((resolve, reject) => {
    ghorg.repos((err, data, header) => {
      if (err) {
        reject(new Error('No repositories found.'));
      } else {
        console.log('\n\rRepositories:\n\r');
        data.forEach(repository => {
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
                if (branch.name !== 'master') {
                  process.chdir(destPath);
                  childProcess.execFileSync('git', ['checkout', branch.name], {
                    env: process.env
                  });
                  process.chdir(rootPath);
                }
              });
            }
          });
        });
        resolve(data);
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
    .catch(error => console.log(error.message));
})();
