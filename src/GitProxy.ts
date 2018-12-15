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
import * as ca from 'azure-devops-node-api/CoreApi';
import * as ga from 'azure-devops-node-api/GitApi';
import { TeamProjectReference } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { GitBranchStats, GitRepository } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { ConnectionData } from 'azure-devops-node-api/interfaces/LocationsInterfaces';

interface IAZGit {
  GitApi: ga.IGitApi;
  CoreApi: ca.ICoreApi;
  connectionData: ConnectionData;
}

export class GitProxy {
  private log: any;
  private options: any;
  private rootPath: string;
  private azgit: IAZGit; // azure devops interface
  constructor(options: any, rootPath: string, log: any) {
    this.options = options;
    this.rootPath = rootPath;
    this.log = log;
    this.azgit = {} as any;
  }
  public authenticate() {
    return new Promise(async (resolve, reject) => {
      if (this.options.stype === 'github') {
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
      } else if (this.options.stype === 'azure-devops') {
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
            this.azgit.GitApi = await connection.getGitApi();
            this.azgit.CoreApi = await connection.getCoreApi();
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
    if (this.options.stype === 'github') {
      return octokit.users
        .getAuthenticated({})
        .then((result: any) => {
          console.log(`Welcome ${result.data.name}${os.EOL}`);
        })
        .catch((error: any) => {
          throw new Error(`getUserInfo: ${error}`);
        });
    }
    if (this.options.stype === 'azure-devops') {
      return new Promise((resolve, reject) => {
        console.log(`Welcome ${this.azgit.connectionData.authenticatedUser.customDisplayName}${os.EOL}`);
        resolve();
      });
    }
  }
  public getOrgInfo() {
    if (this.options.stype === 'github') {
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
    return new Promise(async (resolve, reject) => {
      this.cleanDestination();

      this.log.startLog();

      if (this.options.stype === 'github') {
        octokit.repos.listForOrg({ org: this.options.org, per_page: 100 }, (error: any, result: any) => {
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
                    octokit.repos.listBranches(
                      { owner: this.options.org, repo: repository.name, per_page: 100 },
                      // tslint:disable-next-line:no-shadowed-variable
                      (error: any, result: any) => {
                        if (error) {
                          reject(new Error(`getRepositories: ${error}`));
                        } else {
                          result.data.forEach((branch: any) => {
                            this._backupBranch(repository.html_url, repository.name, branch.name);
                          });
                        }
                        resolve(); // p level
                      },
                    );
                  }),
              );
            });
            p.then(() => {
              this._endLog(result.data.length);

              resolve(result.headers); // main level
            });
          }
        });
      } else if (this.options.stype === 'azure-devops') {
        const projects = await this.azgit.CoreApi.getProjects();

        let totalRepositories = 0;
        console.log(`${os.EOL}Projects (${projects.length}):${os.EOL}`);
        let p = Promise.resolve();
        projects.forEach(async (project: TeamProjectReference) => {
          p = p.then(
            () =>
              // tslint:disable-next-line:no-shadowed-variable
              new Promise<void>(async resolve => {
                const repositories = await this.azgit.GitApi.getRepositories(project.name);
                console.log(`${os.EOL}[${project.name}] Repositories (${repositories.length}):${os.EOL}`);
                totalRepositories += repositories.length;
                let q = Promise.resolve();
                repositories.forEach((repository: GitRepository) => {
                  q = q.then(
                    () =>
                      // tslint:disable-next-line:no-shadowed-variable
                      new Promise<void>(async resolve => {
                        const branches = await this.azgit.GitApi.getBranches(repository.name, project.name);

                        branches.forEach((branch: GitBranchStats) => {
                          this._backupBranch(repository.remoteUrl, repository.name, branch.name, project.name);
                        });
                        resolve(); // q level
                      }),
                  );
                });
                q.then(() => {
                  resolve(); // p level
                });
              }),
          );
        });
        p.then(() => {
          this._endLog(totalRepositories);
          resolve(); // main level
        });
      }
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
              try {
                rimraf.sync(file);
              } catch (error) {
                if (error.code === 'EPERM' && process.platform === 'win32') {
                  throw new Error(
                    `cleanDestination: Please validate that the antivirus is not preventing to delete the path <${file}>.`,
                  );
                } else
                if (error.code === 'ENOTEMPTY' && process.platform === 'win32') {
                  throw new Error(
                    `cleanDestination: Please validate that TortoiseGit is not preventing to delete the path <${file}>.`,
                  );
                } else
                {
                  throw new Error(`cleanDestination: ${error}.`);
                }
              }
            });
        }
      });
    }
  }
  private _endLog(totalRepositories: number) {
    this.log.sendToLog(`Total repositories: ${totalRepositories}.`);
    this.log.sendToLog('');
    this.log.endLog();
  }
  private _getRepoURL(repository: string, project?: string) {
    if (this.options.stype === 'github') {
      if (!this.options.token) {
        // basic
        return `https://${this.options.usr}:${this.options.pwd}@github.com/${this.options.org}/${repository}.git`;
      } else {
        // oauth
        return `https://${this.options.token}@github.com/${this.options.org}/${repository}.git`;
      }
    }
    if (this.options.stype === 'azure-devops') {
      if (this.options.token) {
        // oauth
        return `https://${this.options.token}@${this.options.org}.visualstudio.com/${project}/_git/${repository}`;
      }
    }
  }
  private _cloneRepository(repository: string, branch: string, project?: string) {
    let destPath: string;

    // set path hierarchy
    if (this.options.stype === 'azure-devops') {
      destPath = path.join(this.rootPath, this.options.org, project, repository, branch);
    } else {
      destPath = path.join(this.rootPath, this.options.org, repository, branch);
    }

    // cleanup branch
    rimraf.sync(destPath);

    childProcess.execFileSync('git', ['clone', this._getRepoURL(repository, project), destPath], {
      env: process.env,
    });
    process.chdir(destPath);

    // If the branch is master, it is already cloned
    if (branch !== 'master') {
      childProcess.execFileSync('git', ['checkout', branch], {
        env: process.env,
      });
    }
  }
  private _generateStatistics(repository: string, branch: string, project?: string) {
    if (this.options.log) {
      const commitsHours = 12;

      this.log.sendToLog('=====>');

      if (this.options.stype === 'azure-devops') {
        this.log.sendToLog(`Project: ${project} / Repository: ${repository} / Branch: ${branch}`);
      } else {
        this.log.sendToLog(`Repository: ${repository} / Branch: ${branch}`);
      }

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
  }
  private _backupBranch(url: string, repository: string, branch: string, project?: string) {
    if (this.options.stype === 'azure-devops') {
      console.log(`${project}/${repository} => ${url} (${branch})`);
    } else {
      console.log(`${repository} => ${url} (${branch})`);
    }

    this._cloneRepository(repository, branch, project);
    this._generateStatistics(repository, branch, project);

    process.chdir(this.rootPath);
  }
}
