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

const ghme = client.me();
const ghorg = client.org(options.org);

client.get('/user', {}, function (err, status, body, headers) {
    console.log(`Welcome ${body.name}\n\r`);

    ghorg.info((err, data, header) => {
        console.log(`Info for [${data.login}] organization:`);
        console.log(`* Description: ${data.description}`);
        console.log(`* Url: ${data.html_url}`);
        console.log(`* Total private repositories: ${data.total_private_repos}`);
        console.log(`* Plan: ${data.plan.name}`);
        console.log(`* Plan seats: ${data.plan.seats}`);
        console.log(`* Plan filled seats: ${data.plan.filled_seats}`);
        console.log(`* Default repository permission: ${data.default_repository_permission}`);
        console.log(`* Members can create repositories: ${data.members_can_create_repositories}`);
    });

    ghorg.repos((err, data, header) => {
        console.log('\n\rRepositories:\n\r');
        data.forEach(repository => {
            let ghrepo = client.repo(`${options.org}/${repository.name}`);
            ghrepo.branches((err, data, header) => {
                data.forEach(branch => {
                    console.log(`${repository.name} => ${repository.html_url} (${branch.name})`);
                    let repoURL = `https://${options.usr}:${options.pwd}@github.com/${options.org}/${repository.name}.git`;
                    let destPath = path.join(__dirname, `${options.org}_${repository.name}_${branch.name}`);

                    // cleanup branch
                    rimraf.sync(destPath);

                    childProcess.execFileSync('git', ['clone', repoURL, destPath], {
                        env: process.env
                    });

                    // If the branch is master, it is already cloned
                    if (branch.name != 'master') {
                        process.chdir(destPath);
                        childProcess.execFileSync('git', ['checkout', branch.name], {
                            env: process.env
                        });
                        process.chdir(__dirname);
                    }
                });
            });
        });
    });
});