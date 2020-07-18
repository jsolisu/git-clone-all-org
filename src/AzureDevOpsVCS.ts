/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

import os = require('os');
import path = require('path');

import * as azdev from 'azure-devops-node-api';
import * as ca from 'azure-devops-node-api/CoreApi';
import * as ga from 'azure-devops-node-api/GitApi';
import { TeamProjectReference } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { GitBranchStats, GitRepository } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { ConnectionData } from 'azure-devops-node-api/interfaces/LocationsInterfaces';
import { BaseVCS } from './BaseVCS';

interface IAZGit {
  GitApi: ga.IGitApi;
  CoreApi: ca.ICoreApi;
  connectionData: ConnectionData;
}

export class AzureDevOpsVCS extends BaseVCS {
  private azgit: IAZGit; // azure devops interface

  constructor(options: any, rootPath: string, log: any) {
    super(options, rootPath, log);
    this.azgit = {} as any;
  }

  public authenticate() {
    return new Promise(async (resolve, reject) => {
      if (!this.options.token) {
        reject(new Error('authenticate: Basic authentication is not supported with azure-devops.'));
      } else {
        const authHandler = azdev.getPersonalAccessTokenHandler(this.options.token);
        const connection = new azdev.WebApi(`https://dev.azure.com/${this.options.org}`, authHandler);

        let connectionData: ConnectionData;
        try {
          connectionData = await connection.connect();

          // anonymous user ?
          if (
            typeof connectionData.authorizedUser !== 'undefined' &&
            connectionData.authorizedUser.id === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ) {
            reject(new Error('authenticate: Cannot connect to azure-devops.'));
          } else {
            this.azgit.GitApi = await connection.getGitApi();
            this.azgit.CoreApi = await connection.getCoreApi();
            this.azgit.connectionData = connectionData;
            resolve();
          }
        } catch (e) {
          reject(new Error('authenticate: Cannot connect to azure-devops.'));
        }
      }
    });
  }

  public getUserInfo() {
    return new Promise((resolve, reject) => {
      if (typeof this.azgit.connectionData.authenticatedUser !== 'undefined') {
        console.log(
          `Welcome ${
            this.azgit.connectionData.authenticatedUser.customDisplayName ||
            this.azgit.connectionData.authenticatedUser.providerDisplayName
          } <${this.azgit.connectionData.authenticatedUser.properties.Account.$value}>${os.EOL}`,
        );
      }

      resolve();
    });
  }

  public getOrgInfo() {
    console.log();
  }

  public getRepositories() {
    return new Promise(async (resolve) => {
      this.cleanDestination();

      this.log.startLog();

      const projects = await this.azgit.CoreApi.getProjects();

      let totalRepositories = 0;
      console.log(`${os.EOL}Projects (${projects.length}):${os.EOL}`);
      let p = Promise.resolve();
      projects.forEach(async (project: TeamProjectReference) => {
        p = p.then(
          () =>
            new Promise<void>(async (resolveProject) => {
              const repositories = await this.azgit.GitApi.getRepositories(project.name);
              console.log(`${os.EOL}[${project.name}] Repositories (${repositories.length}):${os.EOL}`);
              totalRepositories += repositories.length;
              let q = Promise.resolve();
              repositories.forEach((repository: GitRepository) => {
                q = q.then(
                  () =>
                    new Promise<void>(async (resolveRepository) => {
                      try {
                        const branches = await this.azgit.GitApi.getBranches(repository.name || '', project.name);

                        branches.forEach((branch: GitBranchStats) => {
                          this.backupBranch(
                            repository.remoteUrl || '',
                            repository.name || '',
                            branch.name || '',
                            project.name,
                          );
                        });
                      } catch (error) {
                        console.log('No branches.');
                        totalRepositories--;

                        resolveRepository(); // q level
                      }

                      resolveRepository(); // q level
                    }),
                );
              });
              q.then(() => {
                resolveProject(); // p level
              });
            }),
        );
      });
      p.then(() => {
        this.endLog(totalRepositories);
        resolve(); // main level
      });
    });
  }

  protected backupBranch(url: string, repository: string, branch: string, project?: string) {
    console.log(`${project}/${repository} => ${url} (${branch})`);
    super.backupBranch(url, repository, branch, project);
  }

  protected getRepoURL(repository: string, project?: string): string {
    if (this.options.token) {
      // oauth
      return `https://${this.options.token}@dev.azure.com/${this.options.org}/${project}/_git/${repository}`;
    } else {
      throw new Error('Unsupported.');
    }
  }

  protected getRepoDestination(repository: string, branch: string, project?: string): string {
    return path.join(this.rootPath, this.options.org, project || '', repository, branch);
  }

  protected generateRepoDescription(repository: string, branch: string, project?: string) {
    this.log.sendToLog(`Project: ${project} / Repository: ${repository} / Branch: ${branch}`);
  }
}
