import { MongoClient } from 'mongodb';
import './api';
import { emit } from './bus';

async function main() {
    const conn = await MongoClient.connect('mongodb://192.168.1.4:27017/test');
    const db = conn.db('test');
    require('./apis/test');
    emit('app/started', db);
}
main();