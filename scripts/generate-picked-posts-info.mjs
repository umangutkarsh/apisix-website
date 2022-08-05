import { stat, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'path';
import Listr from 'listr';
import matter from 'gray-matter';
import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import { format } from 'date-fns';

const configs = ['../blog/en/config/picked-posts.json', '../blog/zh/config/picked-posts.json'];
const parser = remark();

function createExcerpt(fileString) {
  const mdast = parser.parse(fileString);
  let excerpt = '';
  visit(mdast, ['text', 'inlineCode'], (node) => {
    excerpt += node.value;
  });
  return excerpt;
}

const tasks = new Listr([
  {
    title: `Check picked blog config files exist`,
    task: () =>
      Promise.all(
        configs.map((f) =>
          stat(f).then((stat) =>
            stat.isFile() ? Promise.resolve() : Promise.reject(new Error(`${f} is not a file`))
          )
        )
      ),
  },
  {
    title: `Generate picked blog info files`,
    task: () =>
      new Listr(
        configs.map((config) => ({
          title: `picking from ${config}`,
          task: () =>
            readFile(config, 'utf8')
              .then((json) => JSON.parse(json))
              .then((paths) =>
                Promise.all(
                  paths.map((path) =>
                    readFile(`../${path}`, 'utf8').then((content) => {
                      const { data, excerpt } = matter(content, {
                        excerpt: true,
                        excerpt_separator: '<!--truncate-->',
                      });
                      const summary = createExcerpt(excerpt);
                      const locale = path.includes('/zh/blog') ? 'zh-CN' : 'en-US';
                      const rawDate = new Date(
                        path.substring('blog/en/blog/'.length, 'blog/en/blog/2022/07/30'.length)
                      );
                      const date = rawDate.toISOString();
                      const formattedDate = format(
                        rawDate,
                        locale === 'zh-CN' ? 'yyyy年MM月d日' : 'MMM dd, yyyy'
                      );
                      return {
                        ...data,
                        authors: data.authors.map((v) => {
                          if (v.image_url) {
                            v.imageURL = v.image_url;
                            delete v.image_url;
                          }
                          return v;
                        }),
                        tags:
                          data?.tags.map((v) => ({
                            label: v,
                            permalink:
                              locale === 'zh-CN' ? '/zh/blog/tags/' + v : '/blog/tags/' + v,
                          })) || [],
                        summary,
                        permalink: path
                          .substring(locale === 'zh-CN' ? 'blog'.length : 'blog/en'.length)
                          .slice(0, -'.md'.length),
                        date,
                        formattedDate,
                      };
                    })
                  )
                )
                  .then(
                    (matters) =>
                      `/*THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.*/\nconst config = ${JSON.stringify(
                        matters,
                        null,
                        2
                      )};\nmodule.exports = config;`
                  )
                  .then((content) =>
                    writeFile(join(dirname(config), 'picked-posts-info.js'), content, 'utf-8')
                  )
              ),
        })),
        { concurrent: configs.length }
      ),
  },
]);

tasks
  .run()
  .then(() => {
    console.log(`[Finish] Generate picked blog info files`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
