/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

import os = require('os');
import path = require('path');

import _octokit = require('@octokit/rest');
import { BaseVCS } from './BaseVCS';
const octokit = new _octokit();

export class GitHubVCS extends BaseVCS {
  constructor(options: any, rootPath: string, log: any) {
    super(options, rootPath, log);
  }

  public authenticate() {
    return new Promise(async (resolve, reject) => {
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
    });
  }

  public getUserInfo() {
    return octokit.users
      .getAuthenticated({})
      .then((result: any) => {
        console.log(`Welcome ${result.data.name} <${result.data.login}>${os.EOL}`);
      })
      .catch((error: any) => {
        throw new Error(`getUserInfo: ${error}`);
      });
  }

  public getOrgInfo() {
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

  public getRepositories() {
    return new Promise(async resolve => {
      this.cleanDestination();

      this.log.startLog();

      octokit.repos.listForOrg({ org: this.options.org, per_page: 100 }).then((repositoryList: any) => {
        console.log(`${os.EOL}Repositories (${repositoryList.data.length}):${os.EOL}`);
        let p = Promise.resolve();
        repositoryList.data.forEach((repository: any) => {
          p = p.then(
            () =>
              new Promise<void>(resolveRepository => {
                octokit.repos
                  .listBranches({ owner: this.options.org, repo: repository.name, per_page: 100 })
                  .then((branchList: any) => {
                    branchList.data.forEach((branch: any) => {
                      this.backupBranch(repository.html_url, repository.name, branch.name);
                    });
                    resolveRepository(); // p level
                  });
              }),
          );
        });
        p.then(() => {
          this.endLog(repositoryList.data.length);

          resolve(repositoryList.headers); // main level
        });
      });
    });
  }

  protected backupBranch(url: string, repository: string, branch: string, project?: string) {
    console.log(`${repository} => ${url} (${branch})`);
    super.backupBranch(url, repository, branch, project);
  }

  protected getRepoURL(repository: string, project?: string): string {
    if (!this.options.token) {
      // basic
      return `https://${this.options.usr}:${this.options.pwd}@github.com/${this.options.org}/${repository}.git`;
    } else {
      // oauth
      return `https://${this.options.token}@github.com/${this.options.org}/${repository}.git`;
    }
  }

  protected getRepoDestination(repository: string, branch: string, project?: string): string {
    return path.join(this.rootPath, this.options.org, repository, branch);
  }

  protected generateRepoDescription(repository: string, branch: string, project?: string) {
    this.log.sendToLog(`Repository: ${repository} / Branch: ${branch}`);
  }
}
