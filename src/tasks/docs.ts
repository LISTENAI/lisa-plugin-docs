import Lisa from '@listenai/lisa_core';
import { join, relative, basename } from 'path';
import { homedir } from 'os';
import { readJSON, pathExists, writeJSON, mkdirp, readFile, copy } from 'fs-extra';
import { parse } from 'ini';
import * as chokidar from 'chokidar';

const LSDocsWebRemote = 'https://github.com/LISTENAI/LSOpenWeb.git';

export default ({ application, cmd, job }: typeof Lisa) => {
  job('init', {
    title: '初始化',
    async task(ctx, task) {
      task.title = '';
      const PLUGIN_HOME = join(homedir(), '.listenai', 'lisa-docs');
      if (!await pathExists(join(PLUGIN_HOME, 'config.json'))) {
        await mkdirp(PLUGIN_HOME);
        await writeJSON(join(PLUGIN_HOME, 'config.json'), {});
      }
      const PLUGIN_CONFIG = await readJSON(join(PLUGIN_HOME, 'config.json'));
      const LsDocsPath =  await task.prompt({
        type: 'Input',
        message: '输入LSDocsWeb主仓本地目录',
        initial: PLUGIN_CONFIG.ls_docs_path || join(PLUGIN_HOME, 'LSDocsWeb'),
      }) || join(PLUGIN_HOME, 'LSDocsWeb');
      
      PLUGIN_CONFIG.ls_docs_path = LsDocsPath;

      let gitFetchRemote = '';

      if (await pathExists(LsDocsPath)) {
        try {
          const res = await cmd('git', ['remote', '-v'], {
            cwd: LsDocsPath
          });
          res.stdout.split('\n').forEach(item => {
            if (item.indexOf('fetch') >= 0) {
              gitFetchRemote = item;
            }
          })
        } catch (error) {
          
        }
        if (gitFetchRemote.indexOf(LSDocsWebRemote) < 0) {
          throw new Error(`${LsDocsPath} 不是LSDocs的主仓`)
        }
      } else {
        await mkdirp(LsDocsPath);
        await cmd('git', ['clone', 'https://github.com/LISTENAI/LSOpenWeb.git', '.'], {
          cwd: LsDocsPath,
          stdio: 'inherit'
        });
      }

      await cmd('git', ['checkout', 'master'], { cwd: LsDocsPath, stdio: 'inherit' });
      await cmd('git', ['fetch', 'origin', 'master'], { cwd: LsDocsPath, stdio: 'inherit' });

      await cmd('git', ['submodule', 'update', '--init', '--recursive'], { cwd: LsDocsPath, stdio: 'inherit' });

      await cmd('npm', ['install'], { cwd: LsDocsPath, stdio: 'inherit' }) 

      await writeJSON(join(PLUGIN_HOME, 'config.json') ,PLUGIN_CONFIG);

      task.title = '初始化成功';
    },
  });

  job('dev', {
    title: '本地开发',
    async task(ctx, task) {
      task.title = '';
      const PLUGIN_HOME = join(homedir(), '.listenai', 'lisa-docs');
      if (!await pathExists(join(PLUGIN_HOME, 'config.json'))) {
        throw new Error('请先执行`lisa docs init`进行初始化');
      }
      const PLUGIN_CONFIG = await readJSON(join(PLUGIN_HOME, 'config.json'));
      const LsDocsPath = PLUGIN_CONFIG.ls_docs_path;
      if (!LsDocsPath) {
        throw new Error('请先执行`lisa docs init`进行初始化');
      }

      await cmd('git', ['checkout', 'master'], { cwd: LsDocsPath, stdio: 'inherit' });
      await cmd('git', ['fetch', 'origin', 'master'], { cwd: LsDocsPath, stdio: 'inherit' });
      await cmd('git', ['pull', 'origin', 'master'], { cwd: LsDocsPath, stdio: 'inherit' });
      await cmd('git', ['submodule', 'foreach', '--recursive', 'git', 'reset', '--hard'], { cwd: LsDocsPath, stdio: 'inherit' }) 

      const gitmodules = parse((await readFile(join(LsDocsPath, '.gitmodules'))).toString());
      let targetModule = '';
      let targetPath = '';
      try {
        const res = await cmd('git', ['remote', '-v']);
        res.stdout.split('\n').forEach(item => {
          if (item.indexOf('fetch') >= 0) {
            targetModule = item;
          }
        })
      } catch (error) {
        
      }
      for (let key in gitmodules) {
        const gitmodule = gitmodules[key];
        if (targetModule.indexOf(basename(gitmodule.url)) >= 0) {
          targetPath = join(LsDocsPath, gitmodule.path)
        }
      }

      if (targetPath) {

        const watcher = chokidar.watch(process.cwd(), {
          ignored: /[\/\\]\.git/,
          persistent: true
        });
        
        watcher
          .on('add', async (path) => {
            await copy(path, join(targetPath, relative(process.cwd(), path)), { overwrite: true });
          })
          .on('change', async (path) => {
            await copy(path, join(targetPath, relative(process.cwd(), path)), { overwrite: true });
          })
      }
      await cmd('npm', ['run', 'start'], { cwd: LsDocsPath, stdio: 'inherit'})
    },
  });
};

