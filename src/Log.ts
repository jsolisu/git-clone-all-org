/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) JSolisU. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *---------------------------------------------------------------------------------------------- */

import fs = require('fs');
import os = require('os');

// tslint:disable-next-line:no-var-requires
const path = require('path');

export class Log {
  private log: string;
  private rootPath: string;
  private logFile: number;
  private prodName: string;
  constructor(rootPath: string, log: string, prodName: string) {
    this.log = log;
    this.rootPath = rootPath;
    this.prodName = prodName;
    this.logFile = 0;
  }
  public startLog() {
    if (this.log) {
      this.logFile = fs.openSync(path.join(this.rootPath, 'git_clone_all_org.log'), 'w');

      this.sendToLog(`${this.prodName} Log${os.EOL}`);
    }
  }

  public sendToLog(s: string) {
    if (this.log) {
      fs.writeSync(this.logFile, `${s}${os.EOL}`);
    }
  }

  public endLog() {
    if (this.log) {
      fs.closeSync(this.logFile);
    }
  }
}
