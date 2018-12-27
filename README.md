# git-clone-all-org
Clone all organization branches from a Git Server.

### Installation

Windows
```
npm install -g git-clone-all-org
```

Linux
```
sudo npm install -g git-clone-all-org
```

### Usage

```
git-clone-all-org [options]

Options:
  --version   Show version number
  -o, --org   Organization       
  -u, --usr   Git username    
  -p, --pwd   Git password    
  -t, --token Git token (-u and -p parameters are useless)
  -d, --dest  Destination path (-d "c:\\temp")
  -c, --clean Clean destination path
  -l, --log   Generate log
  -z, --zip   Compress backup to <path> + <file>.7z/.tar.xz (if file is $ then use default filename.7z/.tar.xz)
  -y, --stype Server type (github, azure-devops)
  --settings  Settings file <config.json>
  -h          Show help          

 ```
 Note: 
 * Your GitHub token needs repo scope only.
 * **git** and **7z** (only on Windows) need to be installed.

 Samples (put in a file like **config.json**):

 GITHUB

 {
    "stype": "github",
    "org": "MyOrg",
    "token": "...",
    "dest": "C:\\Temp",
    "clean": true,
    "log": true,
    "zip": "C:\\Temp\\$"
}

AZURE

{
    "stype": "azure-devops",
    "org": "MyOrg",
    "token": "...",
    "dest": "C:\\Temp",
    "clean": true,
    "log": true,
    "zip": "C:\\Temp\\$"
}