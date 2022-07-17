import { Collection } from 'mongodb';
import { nanoid } from 'nanoid';
import { registerResolver, registerValue } from '../api';
import { db, elastic } from '../services';

const collTemplates: Collection<{ _id: string, name: string, payload: string }> = db.collection('templates');
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
        index: 'template',
        id: _id,
        body: { name: args.name },
    });
    return res.insertedId;
});
registerResolver('TemplateContext', 'update(id: String!, name: String, payload: JSON)', 'Boolean!', async (args, ctx, info) => {
    await collTemplates.updateOne({ _id: args.id }, { $set: { payload: args.payload, name: args.name } });
    await elastic.delete({
        index: 'template',
        id: args.id,
    });
    await elastic.index({
        index: 'template',
        id: args.id,
        body: { name: args.name },
    });
    return true;
});
registerResolver('TemplateContext', 'del(id: String!)', 'Boolean! @auth', async (args, ctx, info) => {
    const res = await collTemplates.deleteOne({ _id: args.id });
    await elastic.delete({
        index: 'template',
        id: args.id,
    });
    return !!res.deletedCount;
});
registerResolver('TemplateContext', 'search(name: String, size: Int, from: Int)', '[Template]', async (args) => {
    try {
        const res = await elastic.search({
            index: 'template',
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
