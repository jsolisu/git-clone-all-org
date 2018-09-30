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
  -z, --zip   Compress backup to <path> + <file>.7z (if file is $ then use default filename.7z)
  --settings  Settings file <config.json>
  -h          Show help          

 ```
 Note: 
 * Your GitHub token needs repo scope only.
 * **git** and **7z** need to be installed.
