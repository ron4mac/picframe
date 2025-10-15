"use strict";
// Dependencies
import http from 'http';
import https from 'https';
import {parse} from 'querystring';
import {readFile,readFileSync,writeFile,readdir,existsSync,unlinkSync,mkdirSync} from 'fs';
import path from 'path';
import {exec} from 'child_process';

// Config
const documentRoot = '.';
const debugMode = false;
const enableUrlDecoding = true;
const hostname = process.env.NODE_WEB_HOST || '0.0.0.0';
const port = process.env.NODE_WEB_PORT || 80;
const localUrl = process.env.LOCAL_PICFRAME || 'http://picframe.local';
const PLISTS = 'playlists';
const PLISTSFS = PLISTS+'/';
const PLKEYS = 'plkeys';
const PLKEYSFS = PLKEYS+'/';
const SETSF = 'settings.json';

// dynamic variables
var playLists = null;
var curPlist = null;
//var fehp = null;	// feh process
var dspOn = true;
//var ontime = 700;
//var offtime = 2000;
var SS = {ontime: 700, offtime: 2000};

process.on('SIGTERM', signal => {
	console.log(`Process ${process.pid} received a SIGTERM signal`);
//	if (fehp) fehp.kill('SIGTERM');
	process.exit(0);
});
process.on('SIGINT', signal => {
	console.log(`Process ${process.pid} received a SIGINT signal`);
//	if (fehp) fehp.kill('SIGTERM');
	process.exit(0);
});

// serve a file
const serveFile = (filePath, response, url) => {
	console.log('SERVE FILE: '+filePath);
	let extname = String(path.extname(filePath)).toLowerCase();
	const MIME_TYPES = {
		'.html': 'text/html',
		'.css': 'text/css',
		'.js': 'text/javascript',
		'.jpeg': 'image/jpeg',
		'.jpg': 'image/jpeg',
		'.png': 'image/png',
		'.json': 'application/json'
	};

	let contentType = MIME_TYPES[extname] || 'application/octet-stream';

	// Serve static files
	readFile(filePath, 'utf8', function(error, content) {
		if (error) {
			if(error.code === 'ENOENT') {
				readFile(documentRoot + '/404.html', function(error, content) {
					if (error) { console.error(error); }
					else {
						response.writeHead(404, { 'Content-Type': 'text/html' });
						response.end(content, 'utf-8');
						// log served 404 page
						console.log('[Info] Served 404 page.');
					}
				});
			}
			else if (error.code === 'EISDIR' && existsSync(filePath+'/index.html')) {
				readFile(filePath+'/index.html', 'utf8', function(error, content) {
					if (error) { console.error(error); }
					else {
						// substitue for local pic frame
						content = content.replaceAll('%%LOCAL_PICFRAME%%', localUrl);
						response.setHeader('Cache-Control', ['no-cache','max-age=0']);
						response.writeHead(200, { 'Content-Type':'text/html' });
						response.end(content, 'utf-8');
						// log served page
						console.log('[Info] Served:', url);
					}
				});
			}
			else {
				response.writeHead(500);
				response.end('Sorry, check with the site admin for error: '+error.code+' ...\n');
				// display error
				console.log('[Error] Could not serve request:', url);
				console.error(error);
			}
		}
		else {
			if (contentType=='text/html') {
				response.setHeader('Cache-Control', ['no-cache','max-age=0']);
				// substitue for local pic frame
				content = content.replaceAll('%%LOCAL_PICFRAME%%', localUrl);
			}
			response.writeHead(200, { 'Content-Type':contentType });
			response.end(content, 'utf-8');
			// log served response
			console.log('[Info] Served:', url);
		}
	});
};

// send back some JSON data
const jsonRespond = (data, resp) => {
	resp.writeHead(200, { 'Content-Type': 'application/json' }); 
	resp.end(JSON.stringify(data));
};

// send back some text/html data
const textRespond = (data, resp) => {
	resp.writeHead(200, { 'Content-Type': 'text/html' }); 
	resp.end(data);
};

// get playlists
const getPlaylists = (cb) => {
	readdir(PLISTS, (err, files) => {
		if (err) console.error('getPlayLists',err,files);
		playLists = files;
		cb();
	});
};

// perform command
const performCommand = async (parms, resp) => {
	//console.log(parms);
	switch (parms.cmd) {
		case 'lists':
			//console.log('Get Playlists');
			let plists = [];
			let cplk = '';
			readdir(PLKEYS, (err, files) => {
				if (err) console.error('getPlayLists',err,files);
				files.forEach(f => {
					try {
						let parms = JSON.parse(readFileSync(PLKEYSFS+f));
						plists.push({ttl:f, pcnt:parms.pcnt, sdly:parms.sdly, plk:parms.plk});
					} catch (err) {
						console.error(err.message);
					}
				});
				jsonRespond({curlst:curPlist,lists:plists}, resp);
			});
			break;
		case 'poff':
			exec('shutdown -h now', (error, stdout, stderr) => {
				if (error) {
					console.error(`error: ${error.message}`);
					return;
				}
				if (stderr) {
					console.error(`stderr: ${stderr}`);
					return;
				}
				if (stdout) console.log(`stdout: ${stdout}`);
			});
			textRespond('<h1>Shutting down the picture frame ...</h1>', resp);
			break;
		case 'boot':
			exec('reboot', (error, stdout, stderr) => {
				if (error) {
					console.error(`error: ${error.message}`);
					return;
				}
				if (stderr) {
					console.error(`stderr: ${stderr}`);
					return;
				}
				if (stdout) console.log(`stdout: ${stdout}`);
			});
			textRespond('<h1>Restarting the picture frame ...</h1>', resp);
			break;
		case 'prev':
		case 'next':
			let sig = parms.cmd == 'prev' ? '-12' : '-10';
			exec(`killall ${sig} feh`, (error, stdout, stderr) => {
				if (error) {
					console.error(`error: ${error.message}`);
					return;
				}
				if (stderr) {
					console.error(`stderr: ${stderr}`);
					return;
				}
				if (stdout) console.log(`stdout: ${stdout}`);
			});
			jsonRespond({}, resp);
			break;
		case 'dsp':
			exec('vcgencmd display_power '+parms.oo+' 2', (error, stdout, stderr) => {
				if (error) {
					console.error(`error: ${error.message}`);
					return;
				}
				if (stderr) {
					console.error(`stderr: ${stderr}`);
					return;
				}
				if (stdout) console.log(`stdout: ${stdout}`);
			});
			let oo = +parms.oo ? 'On' : 'Off';
			textRespond('<h1>Display '+oo+'</h1>', resp);
			break;
		case 'getset':
			getSettings(resp);
			break;
		default:
			jsonRespond(parms, resp);
	}
};

const fehRun = (plist, dly='5.0') => {
	//// SHOULD THE PLAYLIST BE UPDATED FIRST?
//	exec('killall -9 feh');
//	exec(`DISPLAY=:0.0 feh -D ${dly} --fullscreen --auto-zoom -f playlists/${plist} &`, (error, stdout, stderr) => {
	console.log(`Running playlist ${plist}`);
//	exec(`DISPLAY=:0.0 feh -D ${dly} -F -Y -Z -f playlists/${plist}`, (error, stdout, stderr) => {
	exec(`killall -15 feh; DISPLAY=:0.0 feh -D ${dly} -F -Y -Z -f playlists/${plist}`, {uid:1000}, (error, stdout, stderr) => {
		if (error) {
			console.error(`error: ${error.message}`);
			return;
		}
		if (stderr) {
			console.error(`stderr: ${stderr}`);
			return;
		}
		if (stdout) console.log(`stdout: ${stdout}`);
	});
};

const showPlaylist = (plist) => {
	if (!plist) return;
	curPlist = plist;
	console.log('SPLREAD: '+PLKEYSFS+plist);
	readFile(PLKEYSFS+plist, (error, content) => {
		if (error) {
			console.error(`plkey-error: ${error.message}`)
			fehRun(plist);
			return;
		}
		console.log('SPLKEY: '+content);
	//	console.log(JSON.parse(content));
		fehRun(plist, JSON.parse(content).sdly);
	});
};

// change the playlist being displayed
const setPlaylist = async (parms, resp) => {
	console.log(parms);
	showPlaylist(parms.list);
	jsonRespond({}, resp);
};

// delete a playlist
const delPlaylist = async (parms, resp) => {
	console.log(parms);
	if (parms.delp==curPlist) {
		resp.writeHead(405);
		resp.end('Can not delete the currently running playlist.\n');
		return;
	}
	try {
		unlinkSync(PLISTSFS+parms.delp);
		unlinkSync(PLKEYSFS+parms.delp);
	} catch (err) {
		console.error(err.message);
	}
	getPlaylists(()=>jsonRespond({}, resp));
};

// refresh a playlist
const refrPlaylist = async (parms, resp) => {
	//console.log(parms);
	let ttl = parms.refr;
	console.log('Refreshing: ',ttl);
	readFile(PLKEYSFS+ttl, (error, content) => {
		if (error) { console.error(error); }
		else {
			let lstp = JSON.parse(content);
			getPlayList(lstp.plk, ttl, false);
		}
	});
	jsonRespond({}, resp);
};

// add a new playlist
const addPlaylist = async (parms, resp) => {
	console.log(parms);
	readFile('static/getnpl.htm', (error, content) => {
		resp.writeHead(200, { 'Content-Type': 'text/html' });
		resp.end(content, 'utf-8');
	});
};

// get playlist contents and write to file
const getPlayList = (plk, ttl, nupl=true) => {
	let str = '';
console.log('plk: ',plk);
	let req = https.get(plk, (resp) => {
		resp.on('data', (chunk) => {
			str += chunk;
		}).on('end', () => {
			let plist = str.split('\t\t\t\t').pop().split('\t');
			//console.log(plist);
			writeFile(PLISTSFS+ttl, plist[1], err => {
				if (err) console.error(err);
				if (nupl && playLists.indexOf(ttl) == -1) playLists.push(ttl);
//not here				showPlaylist(ttl);
			});
			readFile(PLKEYSFS+ttl, (error, content) => {
				if (error) {
					console.error(error);
				} else {
					let parms = JSON.parse(content);
					parms.pcnt = plist[0];
					writeFile(PLKEYSFS+ttl, JSON.stringify(parms), err => {
						if (err) { console.error(err); }
						showPlaylist(ttl);	// okay do it here
					});
				}
			});
		});
	}).end();
};

// add a new playlist
const newPlaylist = (parms, resp) => {
	let plk = Buffer.from(parms.plk,'base64').toString('utf8');
	let ttl = parms.ttl;
	let dcttl = Buffer.from(parms.ttl,'base64').toString('utf8');
	let sdly = parms.sdly;
	let pcnt = parms.pcnt;
	console.log(plk,dcttl,pcnt,sdly);
	writeFile(PLKEYSFS+ttl, JSON.stringify({pcnt: pcnt, sdly: sdly, plk: plk}), err => {
		if (err) { console.error(err); }
	getPlayList(plk, ttl, true);
	});
//	getPlayList(plk, ttl, true);
	// creating files above is async
	// but just respond anyway, hoping there was success
//	textRespond(`<span class="good">Playlist "${dcttl}" added to picture frame.</span>`);
	textRespond(`Playlist "${dcttl}" added to picture frame.`, resp);
};

// wait until X window access is authorized
function waitX () {
	//showPlaylist(curPlist);
	//return;
	if (typeof waitX.cnt === 'undefined') {
		waitX.cnt = 5;
	}
	exec('DISPLAY=:0.0 xhost', {uid:1000}, (error, stdout, stderr) => {
		if (error) {
			console.log(`error: ${error.message}`);
			if (--waitX.cnt) setTimeout(waitX, 5000);
			return;
		}
		if (stderr) {console.log(`stderr: ${stderr}`);return;}
		console.log(`stdout: ${stdout}`);
		if (stdout.indexOf('SI:localuser')>0) {
			showPlaylist(curPlist);
		} else {
			waitX.cnt--;
			setTimeout(waitX, 5000);
		}
	});
}

function setSettings (parms, resp) {
	console.log(parms);
	if (parms.timeon) {
		SS.ontime = +(parms.timeon.replace(':',''));
	}
	if (parms.timeoff) {
		SS.offtime = +(parms.timeoff.replace(':',''));
	}
	writeFile(SETSF, JSON.stringify(SS), err => {
		if (err) { console.error(err); }
	});
	textRespond('Settings Saved', resp);
}

function getSettings (resp) {
	jsonRespond(SS, resp);
}


// Web server
http.createServer(function (request, response) {
	const {method, url} = request;

	console.log('[Info] Requested:', url);
	if (debugMode === true && enableUrlDecoding === true) {
		console.log('[Debug] Decoded:', decodeURI(url));
	}

	if (method=='POST') {
		let body = '';
		request.on('error', (err) => {
			console.error(err);
		}).on('data', (chunk) => {
			body += chunk.toString();
		}).on('end', () => {
			response.on('error', (err) => {
				console.error(err);
			});
			newPlaylist(JSON.parse(body), response);
		});
		return;
	}

	if (url.startsWith('/?list')) {
		setPlaylist(parse(url.substring(2)), response);
		return;
	}
	if (url.startsWith('/?cmd')) {
		performCommand(parse(url.substring(2)), response);
		return;
	}
	if (url.startsWith('/?nplk')) {
		addPlaylist(parse(url.substring(2)), response);
		return;
	}
	if (url.startsWith('/?delp')) {
		delPlaylist(parse(url.substring(2)), respoonse);
		return;
	}
	if (url.startsWith('/?refr')) {
		refrPlaylist(parse(url.substring(2)), response);
		return;
	}
	if (url.startsWith('/settings?')) {
		setSettings(parse(url.substring(10)), response);
		return;
	}

	let filePath = parse(url.substring(1));	///.split('?').shift();		//url.split('?').shift();	//url;

	// Correct root path
	if (filePath === '/') {
		filePath = documentRoot + '/index.html';
	}
	else {
		filePath = documentRoot + (enableUrlDecoding === true ? decodeURI(url) : url);
	}

	// serve the file
	serveFile(filePath.split('?').shift(), response, url);

}).listen(port, hostname, () => {
	console.log(`Picframe/Server (http://${hostname}:${port}) started`);
	// make sure playlist folders exist
	try {
		if (!existsSync(PLISTS)) { mkdirSync(PLISTS); }
		if (!existsSync(PLKEYS)) { mkdirSync(PLKEYS); }
	} catch (err) {
		console.error(err);
	}
	// get playlists and start a random one
	getPlaylists(()=>{
		if (playLists) {
			curPlist = playLists[playLists.length * Math.random() | 0];
		}
		waitX();
	});
});

