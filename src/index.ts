/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

import fs = require('fs');
import os = require('os');
import * as yargs from 'yargs';

import * as packageData from '../package.json';
import { GitProxy } from './GitProxy';
import { Log } from './Log';

// tslint:disable-next-line:no-var-requires
const childProcess = require('child_process');
// tslint:disable-next-line:no-var-requires
const path = require('path');
// tslint:disable-next-line:no-var-requires
const commandExists = require('command-exists');
// tslint:disable-next-line:no-var-requires
const moment = require('moment');

const prodName = `${(packageData as any).name} version ${(packageData as any).version}`;
console.log(`${prodName}${os.EOL}(c) 2018 JSolisU. MIT License.${os.EOL}`);

const options = yargs
  .usage('Usage: $0 [options]')
  .alias('o', 'org')
  .describe('o', 'Organization')
  .alias('u', 'usr')
  .describe('u', 'Git username')
  .alias('p', 'pwd')
  .describe('p', 'Git password')
  .alias('t', 'token')
  .describe('t', 'Git token (-u and -p parameters are useless)')
  .alias('d', 'dest')
  .describe('d', 'Destination path (-d <path>)')
  .alias('c', 'clean')
  .describe('c', 'Clean destination path')
  .alias('l', 'log')
  .describe('l', 'Generate log')
  .alias('y', 'stype')
  .describe('y', 'Server type (github, azure-devops)')
  .alias('z', 'zip')
  .describe('z', 'Compress backup to <path> + <file>.7z (if file is $ then use default filename.7z)')
  .config('settings', (configPath: string) => {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  })
  .help('h')
  .demandOption(['o']).argv;

let proxy: any = null;
let rootPath = fixPath(process.cwd());

function fixPath(pathToFix: string) {
  if (process.platform === 'win32') {
    return pathToFix.replace(/\\/g, '\\\\');
  } else {
    return pathToFix;
  }
}

function checkForTools() {
  return commandExists('git')
    .then(() => commandExists('7z'))
    .catch(() => {
      throw new Error(`checkForTools: Please verify that all required software is installed.`);
    });
}

function initialize() {
  return new Promise((resolve, reject) => {
    if (options.dest) {
      if (fs.existsSync(options.dest)) {
        rootPath = fixPath(options.dest);
        proxy = new GitProxy(options, rootPath, new Log(rootPath, options.log, prodName));
        resolve(rootPath);
      } else {
        reject(new Error(`Path <${options.dest}> not found.`));
      }
    } else {
      proxy = new GitProxy(options, rootPath, new Log(rootPath, options.log, prodName));
      resolve(rootPath);
    }
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
  checkForTools()
    .then(() => initialize())
    .then(() => proxy.authenticate())
    .then(() => proxy.getUserInfo())
    .then(() => proxy.getOrgInfo())
    .then(() => proxy.getRepositories())
    .then(() => compressBackup())
    .then(() => console.log('Done.'))
    .catch((error: any) => console.log(error.message));
})();
