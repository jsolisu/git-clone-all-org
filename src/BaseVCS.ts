/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

import fs = require('fs');

// tslint:disable-next-line:no-var-requires
const childProcess = require('child_process');

import path = require('path');
import rimraf = require('rimraf');

export class BaseVCS {
  protected options: any;
  protected log: any;
  protected rootPath: string;

  constructor(options: any, rootPath: string, log: any) {
    this.options = options;
    this.rootPath = rootPath;
    this.log = log;
  }

  public authenticate() {
    throw new Error('Method not implemented.');
  }

  public getUserInfo() {
    throw new Error('Method not implemented.');
  }

  public getOrgInfo() {
    throw new Error('Method not implemented.');
  }

  public getRepositories() {
    throw new Error('Method not implemented.');
  }

  protected cleanDestination() {
    if (this.options.dest && this.options.clean) {
      try {
        console.log('Deleting log file...');
        fs.unlinkSync(path.join(this.rootPath, 'git_clone_all_org.log'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new Error(`cleanDestination: ${error}`);
        }
      }

      fs.readdir(this.rootPath, (err, files) => {
        if (!err) {
          files
            .map((file) => {
              return path.join(this.rootPath, file);
            })
            .filter((file) => {
              return fs.statSync(file).isDirectory();
            })
            .forEach((file) => {
              console.log(`Deleting path <${file}>...`);
              try {
                rimraf.sync(file);
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'EPERM' && process.platform === 'win32') {
                  throw new Error(
                    `cleanDestination: Please validate that the antivirus is not preventing to delete the path <${file}>.`,
                  );
                } else if ((error as NodeJS.ErrnoException).code === 'ENOTEMPTY' && process.platform === 'win32') {
                  throw new Error(
                    `cleanDestination: Please validate that TortoiseGit is not preventing to delete the path <${file}>.`,
                  );
                } else {
                  throw new Error(`cleanDestination: ${error}.`);
                }
              }
            });
        }
      });
    }
  }

  protected backupBranch(url: string, repository: string, branch: string, project?: string) {
    this.cloneRepository(repository, branch, project);
    this.generateStatistics(repository, branch, project);

    process.chdir(this.rootPath);
  }

  protected endLog(totalRepositories: number) {
    this.log.sendToLog(`Total of backed repositories: ${totalRepositories}.`);
    this.log.sendToLog('');
    this.log.endLog();
  }

  protected getRepoURL(repository: string, project?: string) {
    throw new Error('Method not implemented.');
  }

  protected getRepoDestination(repository: string, branch: string, project?: string): string {
    throw new Error('Method not implemented.');
  }

  protected generateRepoDescription(repository: string, branch: string, project?: string) {
    throw new Error('Method not implemented.');
  }

  private cloneRepository(repository: string, branch: string, project?: string) {
    // set path hierarchy
    const destPath: string = this.getRepoDestination(repository, branch, project);

    // cleanup branch
    rimraf.sync(destPath);

    childProcess.execFileSync('git', ['clone', this.getRepoURL(repository, project), destPath], {
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

  private generateStatistics(repository: string, branch: string, project?: string) {
    if (this.options.log) {
      const commitsHours = 12;

      this.log.sendToLog('=====>');

      this.generateRepoDescription(repository, branch, project);

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
}
