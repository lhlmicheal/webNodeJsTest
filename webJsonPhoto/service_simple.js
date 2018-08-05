var httpModel = require('http');
var fs = require('fs');
var url = require('url');

const port = 1137;
const localAddress = '127.0.0.1';
/*
读取相册文件
参数:
客户端模拟请求curl -X GET http://localhost:1337/albums.json
客户端模拟请求curl -X GET http://localhost:1337/albums/italy2012.json
*/
function loadAlbumList(callBack) {
    fs.readdir("albums", function (err, files) {
        if (err) {
            callBack(makeError("file_error", JSON.stringify(err)));
            return;
        }

        var onlyDirs = [];
        (function visitCheck(index) {
            if (index >= files.length) {
                callBack(null, onlyDirs);
                return;
            }
            fs.stat("albums/" + files[index], function (err, stats) {
                if (err) {
                    callBack(makeError("file_error", JSON.stringify(err)));
                    return;
                }
                if (stats.isDirectory()) {
                    var obj = {
                        name: files[index]
                    };
                    onlyDirs.push(files[index]);
                }

                visitCheck(index + 1);
            });
        })(0);

    });
};
function loadAlbum(albums_name, page, pageSize, callBack) {
    fs.readdir("albums/" + albums_name, function (err, files) {
        if (err) {
            if (err.code == "ENOENT") {
                callBack(no_such_album());
            }
            else {
                callBack(makeError("file_error", JSON.stringify(err)));
            }
            return;
        }
        var only_files = [];
        var path = "albums/" + albums_name + "/";
        (function iterator(index) {
            if (index >= files.length) {
                var ps;
                ps = only_files.splice(page * pageSize, pageSize);

                var obj = {
                    short_name: albums_name,
                    photos: ps
                };
                callBack(null, obj);
            }
            fs.stat(path + files[index], function (err, stats) {
                if (err) {
                    callBack(makeError("file_error", JSON.stringify(err)));
                    return;
                }
                if (stats.isFile()) {
                    var obj = {
                        fileName: files[index]
                    };
                    only_files.push(obj);
                }
                iterator(++index);
            });
        })(0);
    });
}

function doRename(oldName, newName, callBack) {

}

function handleListAblums(req, res) {
    loadAlbumList(function (err, albums) {
        if (err) {
            send_failure(res, 500, err);
            return;
        }
        sendSuccess(res, { albums: albums });
    });
}
function handleGetAblum(req, res) {
    var len = req.parseUrl.pathname.length;
    var albums_name = req.parseUrl.pathname.substr(7, len - 12);

    var getQuery = req.parseUrl.query;
    var pageNum = getQuery ? getQuery.page : 0;
    var pageSize = getQuery ? getQuery.page_size : 1000;

    loadAlbum(albums_name, pageNum, pageSize, function (err, album_content) {
        if (err && err.error == "no_such_album") {
            sendFailuer(res, 404, err);
        } else if (err) {
            sendFailuer(res, 500, err);
        } else
            sendSuccess(res, { albums: album_content });
    });
}

/*
重新命名相册
客户端模拟请求curl -s -X POST -H "Content-Type: application/json" \
            -d '{"album_name": "new album name"}' \
            http://localhost:1337/albums/old_album_name/rename.json
*/
function handleRenameAblums(req, res) {
    var pathName = req.parseUrl.pathname;
    var parts = pathName.split('/');
    if (parts.length != 4) {
        sendFailuer(res, 404, invaild_resource(pathName));
        return;
    }
    var albumOldName = parts[2];
    var jsonBody = '';
    req.on("readable", function () {
        var data = req.read();
        if (data) {
            if (typeof data == "string") {
                jsonBody += data;
            } else if (typeof data == "object" && data instanceof Buffer) {
                jsonBody += data.toString("utf8")
            }
        }
    });
    req.on("end", function () {
        // jsonBody is valid
        if (jsonBody) {
            try {
                var albumData = JSON.parse(jsonBody);
                if (!albumData.album_name) {
                    sendFailuer(res, 403, missingData('album_name'));
                    return;
                }
            } catch (error) {
                sendFailuer(res, 403, badJson());
                return;
            }
            // rename
            doRename(albumOldName, albumData.album_name, function (err, result) {
                if (err && err.code == "ENOENT") {
                    sendFailuer(res, 403, no_such_album());
                    return;
                } else if (err) {
                    sendFailuer(res, 500, file_error(err));
                    return;
                }
                sendSuccess(res, null);
            });
        } else {
            sendFailuer(res, 403, badJson());
            res.end();
        }
    });
}
/*
接口方法
*/
function sendFailuer(res, code, err) {
    var code = (code) ? code : err.code;
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: code, message: err.message }) + '\n');
}

function sendSuccess(res, data) {
    // var code = (err.code) ? err.code : err.name;
    res.writeHead(200, { "Content-Type": "application/json" });
    var output = { error: null, data: data };
    res.end(JSON.stringify(output) + '\n');
}

function makeError(err, msg) {
    var e = new Error(msg);
    e.code = err;
    return e;
}

function no_such_album() {
    return makeError("no_such_album", "The specified resource does not exist");
}

function invaild_resource() {
    return makeError("invalid_resource", "The specified resource does not exist");
}

var service = httpModel.createServer(function (req, res) {
    //req operator
    console.log('req_method: ' + req.method + 'req.url:' + req.url);
    req.parseUrl = url.parse(req.url, true);
    console.log('req_parseUrl: ' + JSON.stringify(req.parseUrl) + ' end');
    var pathName = req.parseUrl.pathname;
    var urlType = pathName.substr(0, 7);
    if (pathName == "/albums.json") {
        handleListAblums(req, res);
    } else if (pathName.substr(pathName.length - 12) == "rename.json" && req.method.toLocaleLowerCase() == "post") {
        handleRenameAblums(req, res);
    } else if (urlType == "/albums" && pathName.substr(pathName.length - 5) == ".json" && req.method.toLocaleLowerCase() == "get") {
        handleGetAblum(req, res);
    } else {
        sendFailuer(res, 404, invaild_resource());
    }

    // TODO LOGICAL BUSINESS
    // loadAlbumList(function (err, result) {
    //     if (err) {
    //         res.writeHead(503, { "Content-Type": "application/json" });
    //         res.end(JSON.stringify(err) + '\n');
    //         return;
    //     }
    //     var outData = {
    //         "error": null,
    //         "data": {
    //             "albums": result
    //         }
    //     };
    //     res.writeHead(200, { "Content-Type": "application/json" });
    //     res.end(JSON.stringify(outData) + '\n');

    // });

});

service.listen(port, localAddress);