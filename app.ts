import Schema from 'schemastery';
import { emit } from './bus';
import { connect } from './services';

Schema.extend('image', (data) => {
    if (typeof data === 'string') return [data];
    throw new TypeError(`expected image but got ${data}`);
});

async function main() {
    const db = await connect();
    require('./api');
    require('./apis/test');
    require('./apis/template');
    require('./apis/key');
    require('./apis/user');
    require('./apis/file');
    require('./apis/item');
    emit('app/started', db);
}
main();
