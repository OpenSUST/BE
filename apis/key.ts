import { Collection } from 'mongodb';
import Schema from 'schemastery';
import { registerResolver, registerValue } from '../api';
import { db } from '../services';

export interface Key { _id: string, localization: Record<string, string>, schema: string }
const collKeys: Collection<Key> = db.collection('keys');
registerResolver('Query', 'key', 'KeyContext', () => ({}));
registerValue('Key', [
    ['_id', 'String!'],
    ['localization', 'JSON!'],
    ['schema', 'String!'],
]);
registerResolver('KeyContext', 'get(ids: [String])', '[Key]', async (args) => await collKeys.find(args.ids ? { _id: { $in: args.ids } } : {}).toArray());
registerResolver('KeyContext', 'add(key: String!, schema: String!)', 'Boolean! @auth', async (args) => {
    const res = await collKeys.insertOne({ _id: args.key, schema: args.schema, localization: {} });
    return !!res.insertedId;
});
registerResolver('KeyContext', 'del(key: String!)', 'Boolean! @auth', async (args) => {
    const res = await collKeys.deleteOne({ _id: args.key });
    return !!res.deletedCount;
});
registerResolver('KeyContext', 'setLocalization(key: String!, lang: String!, value: String!)', 'Boolean! @auth', async (args) => {
    const res = await collKeys.updateOne({ _id: args.key }, { $set: { [`localization.${args.lang}`]: args.value } });
    console.log(res);
    return !!res.modifiedCount;
});

function baseSchema(_id: string, localization: Record<string, string>, schema: any) {
    collKeys.updateOne({ _id }, { $set: { localization, schema: JSON.stringify(schema.toJSON()) } }, { upsert: true });
}

type Kind = 'file' | 'image' | 'csv' | 'office' | 'number';
declare module 'schemastery' {
    interface Meta {
        kind?: Kind;
    }
}

function schemaKind(schema: Schema, kind: Kind) {
    schema.meta ||= {};
    schema.meta!.kind = kind;
    return schema;
}

baseSchema('_id', {}, Schema.string());
baseSchema('title', {}, Schema.string().required());
baseSchema('description', {}, Schema.string().required());
baseSchema('images', {}, schemaKind(Schema.array(Schema.string()), 'image'));
