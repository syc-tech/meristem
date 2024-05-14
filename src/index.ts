#!/usr/bin/env node

import { existsSync, writeFileSync, readFileSync } from 'fs';
import { Manager, MeristemConfig } from './manager';
import toml from '@iarna/toml';
import yaml from 'js-yaml';

async function main() {


    const configPath = process.cwd() + '/meristem.yml';

    if ( !existsSync(configPath) ) {
        throw new Error('No meristem.yml config file found in the current directory');
    }

    const config = yaml.load(readFileSync(configPath, 'utf8')) as MeristemConfig;

    const writeConfig = (config: MeristemConfig) => {
        const configString = yaml.dump(config);
        writeFileSync(configPath, configString);
    }

    const manager = new Manager(config, writeConfig);

    manager.run();


}

main().catch(err => console.error(err));
