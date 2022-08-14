import _ from 'lodash';
import { Collection } from 'mongodb';
import { nanoid } from 'nanoid';
import Schema from 'schemastery';
import { registerResolver, registerValue } from '../api';
import { prefix } from '../config';
import { db, elastic } from '../services';
import type { Key } from './key';

const collData: Collection<any> = db.collection('data');
const collKeys: Collection<Key> = db.collection('keys');

elastic.index({
    index: `${prefix}-data`,
    id: 'create-index-test',
    document: { a: 'test' },
}).then(() => {
    elastic.delete({
        index: `${prefix}-data`,
        id: 'create-index-test',
    });
});

async function loadSchema(keys: string[]) {
    const f = await collKeys.find({ _id: { $in: keys } }).toArray();
    const s = {};
    for (const key of keys) {
        const t = f.find((i) => i._id === key);
        if (t?.schema) s[key] = new Schema(JSON.parse(t.schema));
        else s[key] = Schema.never();
    }
    return Schema.object(s);
}

registerValue('ItemResponse', [
    ['items', '[JSON]'],
    ['schema', 'JSON'],
    ['total', 'Int'],
]);
registerResolver('Query', 'item', 'ItemContext', () => ({}));
registerResolver(
    'ItemContext', 'add(payload: JSON!)', 'String! @auth',
    async (args) => {
        const value = (await loadSchema(Object.keys(args.payload)))(args.payload);
        value._id ||= nanoid();
        const res = await collData.insertOne(value);
        await elastic.index({
            index: `${prefix}-data`,
            id: value._id,
            body: _.omit(value, '_id'),
        });
        return res.insertedId;
    },
);
registerResolver(
    'ItemContext', 'update(id: String!, set: JSON!)', 'Boolean! @auth(requires: USER)',
    async (args) => {
        const value = (await loadSchema(Object.keys(args.set)))(args.set);
        const res = await collData.findOneAndUpdate({ _id: args.id }, { $set: value }, { returnDocument: 'after' });
        if (res) {
            await elastic.index({
                index: `${prefix}-data`,
                id: `${res.value._id}`,
                document: _.omit(res.value, '_id'),
            });
        }
        return !!res.value;
    },
);
registerResolver('ItemContext', 'del(id: String!)', 'Boolean!  @auth', async (args) => {
    const res = await collData.deleteOne({ _id: args.id });
    await elastic.delete({
        index: `${prefix}-data`,
        id: args.id,
    });
    return !!res.deletedCount;
});
registerResolver('ItemContext', 'get(id: String, ids: [String])', 'ItemResponse', async (args) => {
    if (!args.id && !args.ids?.length) throw new Error('id or ids required');
    if (args.id) {
        const doc = await collData.findOne({ _id: args.id });
        if (!doc) return { items: [], schema: Schema.object({}).toJSON() };
        const keys = Object.keys(doc).filter((i) => doc[i] !== null);
        const adoc = _.pick(doc, keys);
        return {
            items: [adoc],
            schema: (await loadSchema(keys)).toJSON(),
            total: 1,
        };
    }
    const docs = await (await collData.find({ _id: { $in: args.ids } }).toArray())
        .sort((a, b) => args.ids.indexOf(a._id) - args.ids.indexOf(b._id));
    const keys = _.uniq(_.flatten(docs.map((i) => Object.keys(i).filter((j) => i[j] !== null))));
    const adocs = docs.map((i) => _.pick(i, keys));
    return {
        items: adocs,
        schema: (await loadSchema(keys)).toJSON(),
        total: docs.length,
    };
});
registerResolver('ItemContext', 'count', 'Int!', async (args) => await collData.countDocuments());
registerResolver(
    'ItemContext', 'search(keyword: String!, size: Int, from: Int)', 'ItemResponse',
    async (args) => {
        const res = await elastic.search({
            index: `${prefix}-data`,
            size: args.size || 50,
            from: args.from || 0,
            query: {
                simple_query_string: {
                    query: args.keyword ? `*${args.keyword}* OR ${args.keyword}* OR *${args.keyword}` : '*',
                    fields: ['title^3', 'description'],
                },
            },
        });
        const docs = await collData.find({ _id: { $in: res.hits.hits.map((i) => i._id) } })
            .project({
                _id: 1,
                images: 1,
                title: 1,
                description: 1,
            }).toArray();
        const fields = new Set<string>();
        for (const doc of docs) for (const key in doc) fields.add(key);
        return {
            items: docs,
            schema: (await loadSchema([...fields])).toJSON(),
            total: (res.hits.total as any)?.value ?? res.hits.total,
        };
    },
);
