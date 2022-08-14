import { Client } from '@elastic/elasticsearch';
import { Client as MinIOClient } from 'minio';
import { Db, MongoClient } from 'mongodb';
import {
    bucket, dbName, elasticEndpoint, mongoUrl, prefix,
    region, s3ConnectionConfig,
} from './config';

export let db: Db;
export const elastic = new Client({ node: elasticEndpoint });
export const minio = new MinIOClient(s3ConnectionConfig);
export { bucket, region } from './config';

export async function connect() {
    const conn = await MongoClient.connect(mongoUrl);
    db = conn.db(dbName);
    db.collection = ((orig) => (name) => (prefix ? orig(`${prefix}-${name}`) : orig(name)))(db.collection.bind(db));
    try {
        const exists = await minio.bucketExists(bucket);
        if (!exists) await minio.makeBucket(bucket, region);
    } catch (e) {
        // Some platform doesn't support bucketExists & makeBucket API.
        // Ignore this error.
    }
    return db;
}
