import AutoGitUpdate from './updater/agu.js';

const config = {
    repository: 'https://github.com/ron4mac/picframe',
    fromReleases: true,
    tempLocation: '/tmp/',
    ignoreFiles: ['util/config.js'],
    executeOnComplete: 'sudo systemctl status picframe',
    exitOnComplete: true
}

const updater = new AutoGitUpdate(config);

updater.compareVersions();
