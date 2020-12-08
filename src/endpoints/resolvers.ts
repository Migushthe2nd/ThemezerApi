import downloadPack from "./query/pack/downloadPack";
import {db, pgp} from '../db/db';
import graphqlFields from 'graphql-fields';
import MiniSearch from 'minisearch';
import {errorName} from '../util/errorTypes';
import GraphQLJSON from 'graphql-type-json';

import me from './query/me';
import creator from './query/creator';
import categories from "./query/categories";
import layout from "./query/layout/layout";
import randomLayoutIDs from "./query/layout/randomLayoutIDs";
import theme from "./query/theme/theme";
import randomThemeIDs from "./query/theme/randomThemeIDs";
import pack from "./query/pack/pack";
import randomPackIDs from "./query/pack/randomPackIDs";
import list from "./query/list";
import nxinstaller from "./query/nxinstaller";
import downloadLayout from "./query/layout/downloadLayout";
import downloadCommonLayout from "./query/layout/downloadCommonLayout";
import createOverlay from "./query/createOverlay/createOverlay";
import createOverlayNXThemes from "./query/createOverlay/createOverlayNXThemes";
import deleteTheme from "./mutation/theme/deleteTheme";
import updateAuth from "./mutation/creator/updateAuth";
import uploadSingleOrZip from "./mutation/submitting/uploadSingleOrZip";
import submitThemes from "./mutation/submitting/submitThemes";
import updateProfile from "./mutation/creator/updateProfile";
import setLike from "./mutation/setLike";
import restoreAccount from "./mutation/creator/restoreAccount";
import reportURL from "./mutation/reportURL";
import deletePack from "./mutation/pack/deletePack";
import fs from 'fs';
import updatePack from "./mutation/pack/updatePack";
import updateTheme from "./mutation/theme/updateTheme";
import downloadTheme from "./query/theme/downloadTheme";
import CacheableTheme from "../filetypes/CacheableTheme";
import CacheablePack from "../filetypes/CacheablePack";

const {
    createWriteStream,
    unlink,
} = fs;

export const joinMonsterOptions: any = {dialect: 'pg'};
export const storagePath = `${__dirname}/../../../cdn`;

export const urlNameREGEX = /[^a-zA-Z0-9_.]+/gm;
// const noSpecialCharsREGEX = /[^a-z\d\-]+/gi
export const themeHexREGEX = /^t[0-9a-f]+$/;
export const packHexREGEX = /^p[0-9a-f]+$/;
export const invalidFilenameCharsREGEX = /[\\~#*{}\/:<>?|"]/gm;

export const isHex = (h) => {
    const a = parseInt(h, 16);
    return (a.toString(16) === h);
};

export const avatar = (id, user): string => {
    if (user.avatar) {
        return `https://cdn.discordapp.com/avatars/${id}/${user.avatar}`;
    } else {
        return `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;
    }
};

// https://stackoverflow.com/questions/40697330/skip-update-columns-with-pg-promise
export function str(column) {
    return {
        name: column,
        skip: (c) => !c.exists,
    };
}

export function bool(column) {
    return {
        name: column,
        skip: (c) => !c.exists,
    };
}

// function int(column) {
// 	return {
// 		name: column,
// 		skip: (c) => !c.exists,
// 		init: (c) => +c.value
// 	}
// }

export const themesCS = new pgp.helpers.ColumnSet(
    [
        {name: 'layout_id', cast: 'int'},
        {name: 'piece_uuids', cast: 'uuid[]'},
        'target',
        {name: 'last_updated', cast: 'timestamp without time zone'},
        {name: 'categories', cast: 'varchar[]'},
        {name: 'pack_id', cast: 'int'},
        {name: 'creator_id', cast: 'varchar'},
        {name: 'details', cast: 'json'},
        {name: 'bg_type', cast: 'varchar (3)'},
    ],
    {
        table: 'themes',
    },
);

export const packsCS = new pgp.helpers.ColumnSet(
    [
        {name: 'last_updated', cast: 'timestamp without time zone'},
        {name: 'creator_id', cast: 'varchar'},
        {name: 'details', cast: 'json'},
    ],
    {
        table: 'packs',
    },
);

export const updateCreatorCS = new pgp.helpers.ColumnSet(
    [
        str('custom_username'),
        str('bio'),
        str('banner_image'),
        str('logo_image'),
        str('profile_color'),
        bool('is_blocked'),
    ],
    {
        table: 'creators',
    },
);

export const saveFiles = (files) =>
    files.map(
        ({file, savename, path}) =>
            new Promise<any>(async (resolve, reject) => {
                try {
                    let {createReadStream, filename} = await file.promise;
                    const stream = createReadStream();

                    // Add file extension if none to prevent errors with matching file and directory names
                    const FILE_EXTENSION_REGEX = /\.[^\/.]+$/;
                    if (!FILE_EXTENSION_REGEX.test(filename)) {
                        filename = `${savename || filename}.file`;
                    } else if (savename) {
                        filename = savename + FILE_EXTENSION_REGEX.exec(filename);
                    }

                    const writeStream = createWriteStream(`${path}/${filename}`);

                    writeStream.on('finish', () => {
                        resolve(`${filename}`);
                    });

                    writeStream.on('error', (error) => {
                        unlink(path, () => {
                            // If the uploaded file's size is too big return specific error
                            if (error.message.includes('exceeds') && error.message.includes('size limit')) {
                                reject(errorName.FILE_TOO_BIG);
                            } else {
                                console.error(error);
                                reject(errorName.FILE_SAVE_ERROR);
                            }
                        });
                    });

                    stream.on('error', (error) => writeStream.destroy(error));

                    stream.pipe(writeStream);
                } catch (e) {
                    reject(e);
                }
            }),
    );

export const getTheme = (id, piece_uuids) => {
    return new Promise(async (resolve, reject) => {
        try {
            const theme = new CacheableTheme();
            const resolved = await theme.loadId(id, piece_uuids);

            resolve({
                ...resolved,
                url: `${process.env.API_ENDPOINT}/cdn/cache/themes/${resolved.localfilename}`,
            });

            // Increase download count by 1
            await db.none(
                `
                    UPDATE themes
                    SET dl_count = dl_count + 1
                    WHERE id = hex_to_int('$1^');
                `,
                [id],
            );
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
};

export const downloadPackSeperate = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            const pack = new CacheablePack();
            await pack.loadId(id);

            // Map the NXThemes
            const shouldResolve = pack.getThemes.map((t) => {
                return {
                    name: t.name,
                    pack_name: pack.getName,
                    target: t.target,
                    preview: t.preview,
                    thumbnail: t.thumbnail,
                    filename: t.filename,
                    id: t.id,
                    url: `${process.env.API_ENDPOINT}/cdn/cache/themes/${t.localfilename}`,
                    mimetype: t.mimetype,
                };
            });

            resolve(shouldResolve);

            // Increase download count by 1
            await db.none(
                `
                    UPDATE packs
                    SET dl_count = dl_count + 1
                    WHERE id = hex_to_int('$1^');
                `,
                [id],
            );
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
};

export const filterData = (items, info, {page = 1, limit, query, sort, order = 'desc', layouts, nsfw = false}) => {
    const queryFields = graphqlFields(info);

    if (items?.length > 0) {
        if (query) {
            if (
                !(
                    !!queryFields.id &&
                    !!queryFields.details?.name &&
                    !!queryFields.details?.description &&
                    !!(info.fieldName !== 'layoutList' ? queryFields.categories : true)
                )
            ) {
                throw errorName.CANNOT_SEARCH_QUERY;
            }

            const miniSearch = new MiniSearch({
                fields: ['id', 'name', 'description', 'categories'],
                storeFields: ['id'],
                searchOptions: {
                    // boost: { name: 2 },
                    fuzzy: 0.1,
                },
            });

            const itms = items.map((item: any) => {
                return {
                    id: info.fieldName.charAt(0) + item.id,
                    name: item.details.name,
                    description: item.details.name,
                    categories: item.categories ? item.categories.join(' ') : '',
                };
            });

            miniSearch.addAll(itms);
            const rs = miniSearch.search(query, {
                prefix: true,
            });
            const resultIDs = rs.map((r: any) => r.id);

            items = items.filter((item: any) => resultIDs.includes(info.fieldName.charAt(0) + item.id));
        }

        if (!nsfw && info.fieldName !== 'layoutList') {
            if (!queryFields.categories) throw errorName.CANNOT_FILTER_NSFW;

            items = items.filter((item: any): boolean => {
                return !item.categories?.includes('NSFW');
            });
        }

        if (layouts?.length > 0) {
            if (info.fieldName === 'packList' ? !queryFields.themes.layout?.id : !queryFields.layout?.id)
                throw errorName.CANNOT_FILTER_LAYOUTS;

            items = items.filter((item: any): boolean => {
                return layouts.some((id: string) => {
                    if (item.themes) {
                        // Pack
                        return item.themes.some((t: any) => t.layout?.id === id);
                    } else if (item.layout) {
                        // Theme
                        return item.layout.id === id;
                    } else return false;
                });
            });
        }

        if (sort) {
            const sortOptions = [
                {
                    id: 'downloads',
                    key: 'dl_count',
                },
                {
                    id: 'likes',
                    key: 'like_count',
                },
                {
                    id: 'updated',
                    key: 'last_updated',
                },
                {
                    id: 'id',
                    key: 'id',
                },
            ];

            const sortOption = sortOptions.find((o: any) => o.id === sort);
            if (!sortOption) throw errorName.INVALID_SORT;

            if (sortOption.id === 'downloads' && !queryFields.dl_count) throw errorName.CANNOT_SORT_BY_DOWNLOADS;
            if (sortOption.id === 'likes' && !queryFields.like_count) throw errorName.CANNOT_SORT_BY_LIKES;
            if (sortOption.id === 'updated' && order.toLowerCase() === 'asc' && !queryFields.last_updated)
                throw errorName.CANNOT_SORT_BY_UPDATED;

            items = items.sort((a: any, b: any) => {
                if (order.toLowerCase() === 'asc') {
                    return a[sortOption.key] - b[sortOption.key];
                } else {
                    return b[sortOption.key] - a[sortOption.key];
                }
            });
        }

        const item_count = items.length;

        let page_count = 1;
        if (limit) {
            page_count = Math.ceil(item_count / limit);
        }

        const start = (page - 1) * limit;
        const end = start + limit;

        return {
            items: limit ? items.slice(start, end) : items,
            pagination: {
                page: page || 1,
                limit,
                page_count,
                item_count,
            },
        };
    } else {
        return {
            items: [],
            pagination: {
                page,
                limit,
                page_count: 0,
                item_count: 0,
            },
        };
    }
};

// noinspection ES6ShorthandObjectProperty
export default {
    JSON: GraphQLJSON,
    Query: {
        me,

        creator,

        categories,

        layout,
        theme,
        pack,

        randomLayoutIDs,
        randomThemeIDs,
        randomPackIDs,

        layoutList: list,
        themeList: list,
        packList: list,

        downloadLayout,
        downloadCommonLayout,
        downloadTheme,
        downloadPack,

        nxinstaller,

        createOverlayNXThemes,
        createOverlay,
    },
    Mutation: {
        updateAuth,
        restoreAccount,
        updateProfile,

        uploadSingleOrZip,
        submitThemes,

        setLike,

        deleteTheme,
        updateTheme,
        deletePack,
        updatePack,

        reportURL,
    },
};
