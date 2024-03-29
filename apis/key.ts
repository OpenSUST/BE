import { Collection } from 'mongodb';
import Schema from 'schemastery';
import { registerResolver, registerValue } from '../api';
import { db } from '../services';

export interface Key { _id: string, localization: Record<string, string>, schema: string, meta?: Record<string, any> }
const collKeys: Collection<Key> = db.collection('keys');
registerResolver('Query', 'key', 'KeyContext', () => ({}));
registerValue('Key', [
    ['_id', 'String!'],
    ['localization', 'JSON!'],
    ['schema', 'String!'],
    ['meta', 'JSON'],
]);
registerResolver('KeyContext', 'get(ids: [String])', '[Key]', async (args) => await collKeys
    .find(args.ids ? { _id: { $in: args.ids.map((i) => i.replace(/[.$]/g, '_')) } } : {})
    .sort({ _id: 1 }).toArray());
registerResolver('KeyContext', 'add(key: String!, schema: String!)', 'Boolean! @auth', async (args) => {
    const res = await collKeys.insertOne({
        _id: args.key.replace(/[.$]/g, '_'),
        schema: args.schema,
        localization: {
            'zh-CN': args.key,
        },
    });

    return !!res.insertedId;
});
registerResolver('KeyContext', 'setMeta(key: String!, meta: JSON!)', 'Boolean! @auth', async (args) => {
    const current = await collKeys.findOne({ _id: args.key.replace(/[.$]/g, '_') });
    if (!current) return false;
    const schema = new Schema(JSON.parse(current.schema));
    schema.meta ||= {};
    Object.assign(schema.meta, args.meta);
    const res = await collKeys.updateOne(
        { _id: args.key.replace(/[.$]/g, '_') },
        { $set: { schema: JSON.stringify(schema.toJSON()) } },
    );
    return !!res.modifiedCount;
});
registerResolver('KeyContext', 'del(key: String!)', 'Boolean! @auth', async (args) => {
    const res = await collKeys.deleteOne({ _id: args.key.replace(/[.$]/g, '_') });
    return !!res.deletedCount;
});
registerResolver('KeyContext', 'setLocalization(key: String!, lang: String!, value: String!)', 'Boolean! @auth', async (args) => {
    const res = await collKeys.updateOne({ _id: args.key.replace(/[.$]/g, '_') }, { $set: { [`localization.${args.lang}`]: args.value } });
    console.log(res);
    return !!res.modifiedCount;
});
registerResolver('KeyContext', 'count', 'Int', async () => await collKeys.countDocuments());

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

collKeys.find({}).toArray().then((keys) => {
    for (const key of keys) {
        const n = { ...key };
        if (key._id.includes('.')) {
            n._id = key._id.replace(/[.$]/g, '_');
            n.localization['zh-CN'] = key._id;
            collKeys.deleteOne({ _id: key._id }).then(() => {
                collKeys.insertOne(n);
            });
        }
    }
});
