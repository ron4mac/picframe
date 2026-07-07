"use strict";
// Dependencies
import http from 'http';
import https from 'https';
import {parse} from 'querystring';
import {readFile,readFileSync,writeFile,writeFileSync,createWriteStream,readdir,existsSync,unlinkSync,mkdirSync,rmSync,renameSync} from 'fs';
import path from 'path';
import {exec} from 'child_process';

// Config
const documentRoot = '.';
const debugMode = false;
const enableUrlDecoding = true;
const hostname = process.env.NODE_WEB_HOST || '0.0.0.0';
const port = process.env.NODE_WEB_PORT || 80;
const dspDim = process.env.FRAME_RESOLUTION || '1280x800';
const localUrl = process.env.LOCAL_PICFRAME || 'http://picframe.local';
const adminPass = process.env.ADMIN_PASSWORD || '\t';
const PLISTS = 'playlists';
const PLISTSFS = PLISTS+'/';
const PLKEYS = 'plkeys';
const PLKEYSFS = PLKEYS+'/';
const SETSF = 'settings.json';

// dynamic variables
var playLists = null;
var curPlprms = null;
//var dspDim = '1280x800';
var dspOn = false;
var SS = {ontime: 700, offtime: 2000, curPlist: null};

process.on('SIGTERM', signal => {
	console.log(`Process ${process.pid} received a SIGTERM signal`);
	process.exit(0);
});
process.on('SIGINT', signal => {
	console.log(`Process ${process.pid} received a SIGINT signal`);
	process.exit(0);
});

const displayOn = (oo) => {
	const val = oo ? 0 : 1;
	exec(`sudo sh -c 'echo ${val} > /sys/class/graphics/fb0/blank'`);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const popMsgImg = async (img) => {
	const exp = exec(`fbi -a --noverbose ${img}`);
	await delay(4000);
	exp.kill();
};

// manage display on/off times and check for playlist update
const periodic = () => {
	let date_time = new Date();
	let ctim = +(''+date_time.getHours()+date_time.getMinutes());
	if (dspOn && (ctim > SS.offtime)) {
		dspOn = false;
		exec('killall -q fbi');
		displayOn(false);
	}
	if (!dspOn && (ctim < SS.offtime && ctim > SS.ontime)) {
		dspOn = true;
		displayOn(true);
		showPlaylist(SS.curPlist);

	}
	// if the display is on and there is a playlist, check remote for a playlist update
	if (dspOn && SS.curPlist && curPlprms) {
		let str = '';
		let req = https.get(curPlprms.plk+"&pco=1", (resp) => {
			resp.on('data', (chunk) => {
				str += chunk;
			}).on('end', () => {
				if (str != curPlprms.pcnt) {
					// need to update the playlist
					console.log('Reloading playlist: ', SS.curPlist);
					// need to kill feh first
					exec('killall -q fbi', (error, stdout, stderr) => {
					//	popMsgImg('static/updating.png').then(()=>getPlayList(curPlprms.plk, SS.curPlist, false));
					//	popMsgImg('static/updating.png').then(()=>getPlayList(curPlprms.plk, SS.curPlist, false));
						getPlayList(curPlprms.plk, SS.curPlist, false);
					});
				}
			});
		}).end();
	}
};

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
						content = htmlReplace(content);
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
				content = htmlReplace(content);
				response.setHeader('Cache-Control', ['no-cache','max-age=0']);
			}
			response.writeHead(200, { 'Content-Type':contentType });
			response.end(content, 'utf-8');
			// log served response
			console.log('[Info] Served:', url);
		}
	});
};

// replace html placeholders with actual values
const htmlReplace = (htm) => {
	htm = htm.replaceAll('%%LOCAL_PICFRAME%%', localUrl);
	htm = htm.replaceAll('%%ADMIN_PASSWORD%%', adminPass);
	return htm;
}

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

const sendKey = (key) => {
	const stream = createWriteStream('/dev/tty1');
	stream.write(key);
	stream.end();
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
				jsonRespond({curlst:SS.curPlist,lists:plists}, resp);
			});
			break;
		case 'poff':
			exec('sudo shutdown -h now', (error, stdout, stderr) => {
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
			exec('sudo reboot', (error, stdout, stderr) => {
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
			const key = parms.cmd == 'prev' ? 'k' : 'j';
			sendKey(key);
			jsonRespond({}, resp);
			break;
		case 'dsp':
			const oo = +parms.oo ? true : false;
			if (oo) {
			//	showPlaylist(SS.curPlist);
			} else {
			//	exec('killall -q fbi');
			}
			displayOn(oo);
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
	console.log(`Running playlist ${plist}`);
//	runFBI(`--noonce -t ${dly} -l playlists/${plist}`);
	runFBI(`--noonce -t ${dly} -l fbilist`);
};

const runFBI = (parms) => {
	console.log(`Running playlist ${parms}`);
	//exec(`DISPLAY=:0 feh -D ${dly} -F -Y -Z -f playlists/${plist}`, {uid:1000}, (error, stdout, stderr) => {
	// changed to randomize each cycle thru list and get list from STDIN to prevent feh modifying playlist file
//	exec('setterm --cursor off');
//	exec(`fbi -a -u --noedit --noverbose --nointeractive ${parms}`, {uid:1000}, (error, stdout, stderr) => {
	exec(`fbi -a -u --noedit --noverbose ${parms}`, {uid:1000}, (error, stdout, stderr) => {
		if (error) {
			if (error.code != 143) {
				console.error(error);
		}
		}
		if (stderr) {
			console.error(`runFBI_stderr: ${stderr}`);
		}
		if (stdout) console.log(`runFBI_stdout: ${stdout}`);
	});
};

const downloadImage = async (url, outputPath) => {
	if (!existsSync(outputPath)) try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.statusText} ${url}`);
		}
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		writeFileSync(outputPath, buffer);
//		console.log('Image saved successfully!');
	} catch (err) {
		console.error('Error downloading image:', err);
	}
}

const buildFbiList = (plist) => {
	const content = readFileSync(PLISTSFS+plist, 'utf-8');
	const lines = content.split(/\r?\n/);
	let pics = [];
	const imgd = `cache/${plist}/`;
	mkdirSync(imgd, {recursive: true});
	const regex = /&p=([^&]+)/;
	lines.forEach(l => {
		const match = l.match(regex);
		pics.push(imgd+match[1]);
		downloadImage(l, imgd+match[1]);
	});
	writeFileSync('fbilist', pics.join('\n'), 'utf-8');
};

const showPlaylist = (plist) => {
//console.log('LPIST: '+plist);
	if (!plist) return;
	buildFbiList(plist);
	exec('killall -q fbi');
	let chngd = plist != SS.curPlist
	SS.curPlist = plist;
	if (chngd) saveSettings();
	console.log('SPLREAD: '+PLKEYSFS+plist);
	readFile(PLKEYSFS+plist, (error, content) => {
		if (error) {
			console.error(`plkey-error: ${error.message}`)
			fehRun(plist);
			return;
		}
		console.log('SPLKEY: '+content);
		curPlprms = JSON.parse(content);
		fehRun(plist, curPlprms.sdly);
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
	if (parms.delp==SS.curPlist) {
		resp.writeHead(405);
		resp.end('Can not delete the currently running playlist.\n');
		return;
	}
	try {
		unlinkSync(PLISTSFS+parms.delp);
		unlinkSync(PLKEYSFS+parms.delp);
		rmSync('cache/'+parms.delp, {recursive:true, force:true});
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
	let req = https.get(plk+'&ddim='+dspDim, (resp) => {
		resp.on('data', (chunk) => {
			str += chunk;
		}).on('end', () => {
			let plist = str.split('\t\t\t\t').pop().split('\t');
			//console.log(plist);
			writeFile(PLISTSFS+ttl, plist[1], err => {
				if (err) console.error(err);
				if (nupl && playLists.indexOf(ttl) == -1) playLists.push(ttl);
			});
			readFile(PLKEYSFS+ttl, (error, content) => {
				if (error) {
					console.error(error);
				} else {
					let parms = JSON.parse(content);
					parms.pcnt = plist[0];
					writeFile(PLKEYSFS+ttl, JSON.stringify(parms), err => {
						if (err) { console.error(err); }
						showPlaylist(ttl);
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
	textRespond(`Playlist "${dcttl}" added to picture frame.`, resp);
};

function editPlist (parms, resp) {
	console.log(parms);
	if (parms.npln != parms.pln) {
		try {
			renameSync(PLKEYSFS+parms.pln, PLKEYSFS+parms.npln);
			renameSync(PLISTSFS+parms.pln, PLISTSFS+parms.npln);
			renameSync('cache/'+parms.pln, 'cache/'+parms.npln);
			parms.pln = parms.npln;
			console.log('File(s) renamed successfully!');
		} catch (error) {
			console.error('Error renaming file:', error.message);
		}
	}
	let plvs = JSON.parse(readFileSync(PLKEYSFS+parms.pln));
	if (parms.nsdly != plvs.sdly) {
		plvs.sdly = parms.nsdly;
		writeFile(PLKEYSFS+parms.pln, JSON.stringify(plvs), err => {
			if (err) { console.error(err); }
			textRespond('Change(s) made', resp);
		});
	} else {
		textRespond('Change(s) made', resp);
	}
}

function setSettings (parms, resp) {
	console.log(parms);
	if (parms.timeon) {
		SS.ontime = +(parms.timeon.replace(':',''));
	}
	if (parms.timeoff) {
		SS.offtime = +(parms.timeoff.replace(':',''));
	}
	saveSettings();
	textRespond('Settings Saved', resp);
	console.log('set: ',SS);
}

function saveSettings () {
	writeFile(SETSF, JSON.stringify(SS), err => {
		if (err) { console.error(err); }
	});
}

function getSettings (resp) {
	console.log('get: ',SS);
	jsonRespond(SS, resp);
}

/*
should consider using this to get the display resolution
exec("DISPLAY=:0 xrandr --current | grep '*' | awk '{print $1}'", (error, stdout, stderr) => {
	//resolution in stdout
	console.log([error, stdout, stderr]);
});
*/

// read the settings
if (existsSync(SETSF)) SS = JSON.parse(readFileSync(SETSF));
//exec('sudo sh -c "setterm --cursor off > /dev/tty1 && clear > /dev/tty1"');
//exec('sudo sh -c "setterm --cursor off > /dev/tty1"');

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
	if (url.startsWith('/edt?')) {
		editPlist(parse(url.substring(5)), response);
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
		delPlaylist(parse(url.substring(2)), response);
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

	let filePath = parse(url.substring(1)); ///.split('?').shift();		//url.split('?').shift();	//url;

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
		if (playLists.length) {
			if (!SS.curPlist) SS.curPlist = playLists[playLists.length * Math.random() | 0];
			periodic();
		} else {
			runFBI('static/nolists.png');
		}
	});
	// manage display on/off times and check for playlist update
	setInterval(periodic, 60000);	// once a minute
});

