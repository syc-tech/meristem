#!/usr/bin/env node

import { existsSync, writeFileSync } from 'fs';
import { Manager, MeristemConfig } from './manager';
import toml from '@iarna/toml';
import yaml from 'js-yaml';

async function main() {


    const configPath = process.cwd() + '/meristem.toml';

    if ( !existsSync(configPath) ) {
        throw new Error('No meristem.toml config file found in the current directory');
    }

    const config = yaml.load(configPath) as MeristemConfig;

    const writeConfig = (config: MeristemConfig) => {
        const configString = yaml.dump(config);
        writeFileSync(configPath, configString);
    }

    const manager = new Manager(config, writeConfig);

    manager.run();


}

main().catch(err => console.error(err));
