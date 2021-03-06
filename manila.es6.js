'use strict';

const read = require('fs').readFile,
    path = require('path'),
    parse = require('./parse'),
    escapeMap = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&apos;'
    };

let compiled = {};

function htmlEscape(str) {
    return str.replace(/[&<>'"]/g, c => {
        return escapeMap[c];
    });
}

global._e_ = function(val) {
    return typeof val === 'string' ? htmlEscape(val) : val;
};

function promisify(callback, resolve, reject) {
    
    resolve = callback ? data => {
        callback(undefined, data);
    } : resolve;

    reject = callback ? error => {
        callback(error);
    } : reject;

    return {
        resolve: resolve,
        reject: reject
    };
}

function parseIncludes(template, callback, opts) {

    let match = /<<\s*?include\s(\S*?)\s*?>>/i.exec(template),
        ext = new RegExp(opts.extension + '$'),
        raw, include;

    if (match !== null) {

        raw  = match[0];
        include = opts.partialsDir + match[1];

        if (!include.match(ext)) {
            include += opts.extension;
        }
        
        read(include, { encoding: 'utf8' }, function(err, html) {
            parseIncludes(template.replace(raw, html), callback, opts);
        });
    } else {
        callback(template);
    }
}

function manila(opts) {

    let partialsDir,
        viewsDir,
        root,
        extension = '.mnla';

    root = opts.root || path.dirname(require.main.filename);
    viewsDir = path.join(root, 'views');
    viewsDir = path.join(opts ? opts.views || viewsDir : viewsDir, '/');
    partialsDir = path.join(root, opts ? opts.partials || viewsDir : viewsDir, '/');
    extension = opts.extension ? '.' + opts.extension : extension;
    extension = extension.replace('..', '.');

    function getFile(filepath) {

        return new Promise((resolve, reject) => {
            // Support paths relative to views directory
            if (filepath.indexOf(root) !== 0) {
                filepath = path.join(root, viewsDir, filepath);
            }
            // Add extension if missing
            if (!filepath.match(new RegExp(extension + '$'))) {
                filepath += extension;
            }

            read(filepath, { encoding: 'utf8' }, function(err, template) {

                if (err) {
                    reject(err);
                } else {
                    
                    parseIncludes(template, fullTemplate => {
                        resolve(fullTemplate);
                    }, {
                        partialsDir: partialsDir,
                        extension: extension
                    });
                }
            });
        });
    }

    function compile(filepath, callback) {

        return new Promise((resolve, reject) => {

            let p = promisify(callback, resolve, reject);

            getFile(filepath)
                .then(template => {
                    compiled[filepath] = parse(template);
                    p.resolve(compiled[filepath]);
                })
                .catch(error => {
                    p.reject(error);
                });
        });
    }

    function init(filepath, context, callback) {

        return new Promise((resolve, reject) => {

            let p = promisify(callback, resolve, reject);

            if (compiled[filepath]) {

                let result = compiled[filepath](context);
                p.resolve(result);
            
            } else {

                compile(filepath, (error, render) => {

                    if (error) {
                        p.reject(error);
                    } else {
                        p.resolve(render(context));
                    }
                });
            }
        });
    };

    init.compile = compile;

    return init;
}

export default function(opts) {
    return manila(opts || {});
};
