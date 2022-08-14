import assert from 'assert';
import { Collection } from 'mongodb';
import { nanoid } from 'nanoid';
import { registerResolver, registerValue } from '../api';
import { prefix } from '../config';
import { db, elastic } from '../services';

const collTemplates: Collection<{ _id: string, name: string, payload: any }> = db.collection('templates');
export interface Key { _id: string, localization: Record<string, string>, schema: string }
const collKeys: Collection<Key> = db.collection('keys');

(async () => {
    const r = await collTemplates.findOne({ _id: '000000000000000000000' });
    if (!r) {
        collTemplates.insertOne({
            _id: '000000000000000000000',
            name: '默认模板',
            payload: [
                { key: '_id' },
                { key: 'title' },
                { key: 'description' },
                { key: 'images' },
            ],
        });
    }
    await elastic.index({
        index: `${prefix}-template`,
        id: '000000000000000000000',
        body: {
            name: '默认模板',
        },
    });
})();

registerValue('Template', [
    ['_id', 'String!'],
    ['name', 'String!'],
    ['payload', 'JSON!'],
]);
registerResolver('Query', 'template', 'TemplateContext', () => ({}));
registerResolver('TemplateContext', 'add(name: String!, payload: JSON!)', 'String! @auth', async (args, ctx, info) => {
    const _id = nanoid();
    const res = await collTemplates.insertOne({ _id, ...args });
    await elastic.index({
        index: `${prefix}-template`,
        id: _id,
        body: { name: args.name },
    });
    return res.insertedId;
});
registerResolver('TemplateContext', 'update(id: String!, name: String, payload: JSON)', 'Boolean!', async (args, ctx, info) => {
    if (args.id === '000000000000000000000') {
        assert(['_id', 'title', 'description', 'images'].map((i) => args.payload.find((i: any) => i.key === i)).every((i) => i));
    }
    await collTemplates.updateOne({ _id: args.id }, { $set: { payload: args.payload, name: args.name } });
    await elastic.delete({
        index: `${prefix}-template`,
        id: args.id,
    });
    await elastic.index({
        index: `${prefix}-template`,
        id: args.id,
        body: { name: args.name },
    });
    return true;
});
registerResolver('TemplateContext', 'del(id: String!)', 'Boolean! @auth', async (args, ctx, info) => {
    if (args.id === '000000000000000000000') {
        throw new Error('不能删除此模板。');
    }
    const res = await collTemplates.deleteOne({ _id: args.id });
    await elastic.delete({
        index: `${prefix}-template`,
        id: args.id,
    });
    return !!res.deletedCount;
});
registerResolver('TemplateContext', 'search(name: String, size: Int, from: Int)', '[Template]', async (args) => {
    try {
        const res = await elastic.search({
            index: `${prefix}-template`,
            size: args.size || 50,
            from: args.from || 0,
            query: {
                simple_query_string: {
                    query: args.name ? `*${args.name}* OR *${args.name} OR ${args.name}*` : '*',
                    fields: ['name'],
                },
            },
        });
        const docs = await collTemplates.find({ _id: { $in: res.hits.hits.map((i) => i._id) } }).toArray();
        console.log(docs);
        return docs;
    } catch (e) {
        console.log(e);
        return [];
    }
});
registerResolver('TemplateContext', 'get(id: String!)', 'Template', async (args, ctx, info) => await collTemplates.findOne({ _id: args.id }));
registerResolver('Template', 'keys', '[Key]', async (args, ctx, info) => {
    if (!ctx.parent._id) return null;
    const keys = ctx.parent.payload.map((i) => i.key);
    return (await collKeys.find({ _id: { $in: keys } }).toArray())
        .sort((a, b) => (ctx.parent.payload.findIndex((i) => i.key === a._id) - ctx.parent.payload.findIndex((i) => i.key === b._id)));
});
