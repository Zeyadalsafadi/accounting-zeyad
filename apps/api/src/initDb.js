import { runMigrations, runSeeds } from './database/index.js';

runMigrations();
runSeeds();

console.log('Database initialization completed successfully.');
