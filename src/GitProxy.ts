/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

import fs = require('fs');
import os = require('os');

// tslint:disable-next-line:no-var-requires
const childProcess = require('child_process');
// tslint:disable-next-line:no-var-requires
const rimraf = require('rimraf');
// tslint:disable-next-line:no-var-requires
const path = require('path');
// tslint:disable-next-line:no-var-requires
const octokit = require('@octokit/rest')();

import * as azdev from 'azure-devops-node-api';
import * as ga from 'azure-devops-node-api/GitApi';
import { toASCII } from 'punycode';

export class GitProxy {
  private log: any;
  private options: any;
  private rootPath: string;
  private azgit: any; // azure devops interface
  constructor(options: any, rootPath: string, log: any) {
    this.options = options;
    this.rootPath = rootPath;
    this.log = log;
    this.azgit = {} as any;
  }
  public authenticate() {
    return new Promise(async (resolve, reject) => {
      if (this.options.serverType === 'github') {
        if (!this.options.token) {
          if (!this.options.usr || !this.options.pwd) {
            reject(new Error('authenticate: Basic authentication requires both user and password parameters.'));
          }
          octokit.authenticate({
            password: this.options.pwd,
            type: 'basic',
            username: this.options.usr,
          });
        } else {
          octokit.authenticate({
            token: this.options.token,
            type: 'oauth',
          });
        }
        resolve();
      } else if (this.options.serverType === 'azure-devops') {
        if (!this.options.token) {
          reject(new Error('authenticate: Basic authentication is not supported with azure-devops.'));
        } else {
          const authHandler = azdev.getPersonalAccessTokenHandler(this.options.token);
          const connection = new azdev.WebApi(`https://dev.azure.com/${this.options.org}`, authHandler);

          const connectionData = await connection.connect();

          // anonymous user ?
          if (connectionData.authorizedUser.id === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') {
            reject(new Error('authenticate: Cannot connect to azure-devops.'));
          } else {
            this.azgit.api = await connection.getGitApi();
            this.azgit.connectionData = connectionData;
            resolve();
          }
        }
      } else {
        reject(new Error('authenticate: Server type is not supported.'));
      }
    });
  }
  public getUserInfo() {
    if (this.options.serverType === 'github') {
      return octokit.users
        .get({})
        .then((result: any) => {
          console.log(`Welcome ${result.data.name}${os.EOL}`);
        })
        .catch((error: any) => {
          throw new Error(`getUserInfo: ${error}`);
        });
    }
    if (this.options.serverType === 'azure-devops') {
      return new Promise((resolve, reject) => {
        console.log(`Welcome ${this.azgit.connectionData.authenticatedUser.customDisplayName}${os.EOL}`);
        resolve();
      });
    }
  }
  public getOrgInfo() {
    if (this.options.serverType === 'github') {
      return octokit.orgs
        .get({ org: this.options.org })
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
  }
  public getRepositories() {
    return new Promise((resolve, reject) => {
      this.cleanDestination();

      this.log.startLog();

      octokit.repos.getForOrg({ org: this.options.org, per_page: 100 }, (error: any, result: any) => {
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
                    { owner: this.options.org, repo: repository.name, per_page: 100 },
                    // tslint:disable-next-line:no-shadowed-variable
                    (error: any, result: any) => {
                      if (error) {
                        // TODO
                      } else {
                        result.data.forEach((branch: any) => {
                          console.log(`${repository.name} => ${repository.html_url} (${branch.name})`);

                          let repoURL;
                          if (!this.options.token) {
                            // basic
                            repoURL = `https://${this.options.usr}:${this.options.pwd}@github.com/${this.options.org}/${
                              repository.name
                            }.git`;
                          } else {
                            // oauth
                            repoURL = `https://${this.options.token}@github.com/${this.options.org}/${
                              repository.name
                            }.git`;
                          }

                          const destPath = path.join(
                            this.rootPath,
                            `${this.options.org}_${repository.name}_${branch.name}`,
                          );

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
                          if (this.options.log) {
                            const commitsHours = 12;

                            this.log.sendToLog('=====>');
                            this.log.sendToLog(`Repository: ${repository.full_name} / Branch: ${branch.name}`);

                            this.log.sendToLog(`Last commits (in the last ${commitsHours} hours):`);

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
                                this.log.sendToLog(`${data[0]}@${data[1]}`);
                                count++;
                              }
                            });

                            if (count === 0) {
                              this.log.sendToLog(`No commits.`);
                            }
                            this.log.sendToLog('');
                          }

                          process.chdir(this.rootPath);
                        });
                      }
                      resolve();
                    },
                  );
                }),
            );
          });
          p.then(() => {
            this.log.sendToLog(`Total repositories: ${result.data.length}.`);
            this.log.sendToLog('');
            this.log.endLog();
            resolve(result.headers);
          });
        }
      });
    });
  }
  private cleanDestination() {
    if (this.options.dest && this.options.clean) {
      try {
        console.log('Deleting log file...');
        fs.unlinkSync(path.join(this.rootPath, 'git_clone_all_org.log'));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw new Error(`cleanDestination: ${error}`);
        }
      }

      fs.readdir(this.rootPath, (err, files) => {
        if (!err) {
          files
            .map(file => {
              return path.join(this.rootPath, file);
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
  private fixPath(pathToFix: string) {
    if (process.platform === 'win32') {
      return pathToFix.replace(/\\/g, '\\\\');
    } else {
      return pathToFix;
    }
  }
}
