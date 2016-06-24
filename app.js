var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require("mongoose"),
	Promise = require("bluebird"),
	Cue = require('./js/db').Cue,
	User = require('./js/db').User,

	port = Number(process.env.PORT || 3000);
	
	hasChangedVideo = false,

server.listen(port, function() {
	console.log("now listening on: " + port);
});

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index1.html');
});

app.use(express.static('public'));

// Start of Socket code

io.on('connection', function(socket) {
	getCue()
	.then(function(cue) {
		io.sockets.emit('send cue', cue);
	})
	.catch(function(err) {
		console.log("Error", err)
	})

	socket.on('new user', function(data, callback) {
		console.log("New user")
		getUsers()
		.then(function(users) {
     		var userNames = users.map(function(user) { return user.name })
			if (userNames.indexOf(data.nick) > -1) {
				callback(false); 
			}
			else {
				callback(true);
				socket.nickname = data.nick;
				return addUser(data.nick, data.flag)
				.then(function() {
					return getUsers()
					.then(function(users) {
						socket.broadcast.emit('user join', {nick: socket.nickname})
						io.sockets.emit('send users', users)
					})
				})
			}
		})
		.catch(function(e) {
			console.log("Error", e, e.stack)
		})
	});

	socket.on('disconnect', function(data) {
		if (!socket.nickname) {
			console.log("No socket nickname")
			return // do nothing if no socket.nicknames
		}
		else {
			return removeUser(socket.nickname)
			.then(function() {
				return getUsers()
				.then(function(users) {
					socket.broadcast.emit('user leave', {nick: socket.nickname});
	        		io.sockets.emit('send users', users);
				})
				.catch(function(e) {
				console.log("Error", e, e.stack)
				})
			})
		}
	})

	socket.on('vote skip', function(data) {
		console.log("Vote skip")
		getUsers()
		.then(function(users) {
			console.log(users, users.length)
			if (data.skipvotes >= Math.round(users.length/2)) {
				io.sockets.emit('skip', {skip: true, skipvotes: data.skipvotes, username: socket.nickname})
			} else {
				io.sockets.emit('skip', {skip: false, skipvotes: data.skipvotes, username: socket.nickname})
			}
		})
	});

	socket.on('new video', function(data) {
		console.log("New video")

		return addToCue(data.id, data.title, socket.nickname)
		.then(function() {
			return getCue()
		})
		.then(function(cue) {
			io.sockets.emit('send cue', cue);
		})
		.then(function() {
			console.log("Emit change video")
			io.sockets.emit('change video', {id: data.id, title: data.title, nick: socket.nickname});
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});

	socket.on('play next video', function() {
		console.log("Play next video")
		// when TRUE do nothing
		if (hasChangedVideo) 
			return
		hasChangedVideo = true;
		setTimeout(function() {
			hasChangedVideo = false;
		}, 3000);

		getCue()
		// if cue.length is TRUE removeFromCue else if FALSE return cue
		.then(function(cue) { 
			return cue.length ? removeFromCue(cue[0].id) : cue 
		})
		.then(function(cue) {
			return getCue()
		})
		.then(function(cue) {
			io.sockets.emit('send cue', cue);
			return cue
		})
		.then(function(cue) { 
			io.sockets.emit('next video');
			return cue 
		})
		.then(console.log)
		.catch(function(e) {
			console.log("Error")
		})
	})

	socket.on('send message', function(data, callback) {
		var msg = data.trim();
		io.sockets.emit('new message', {msg: msg, nick: socket.nickname});
	});

	socket.on('pause video', function(data) {
		io.sockets.emit('pause video');
	});

	socket.on('play video', function(data) {
		io.sockets.emit('play video');
	});

	socket.on('good vibe', function(data) {
		console.log(data)
		return changeVibe('good', data)
		.then(function() {
			return getUsers()
		})
		.then(function(users) {
			io.sockets.emit('send users', users);
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});

	socket.on('bad vibe', function(data) {
		return changeVibe('bad', data)
		.then(function() {
			return getUsers()
		})
		.then(function(users) {
			io.sockets.emit('send users', users);
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});
});

// End of Socket code

// User code

var getUsers = function() {
	console.log("getUsers")
	return new Promise(function(resolve, reject) {
		User.find({}).exec(function(err, users) {
			if (err) {
				console.log(err)
				reject(err)
			}
			 else {
				resolve(users)
			}
		});
	});
}

var addUser = function(name, flag) {
	return new Promise(function(resolve, reject) {
		var user = new User();
		user.name = name;
		user.flag = flag;
		user.save(function(err, data) {
			if (err) {
				reject(err)
			}
			else {
				resolve();
			}
		})		
	})
}

var removeUser = function(name) {
	return new Promise(function(resolve, reject) {
		User.find({'name' : name}).remove(function(err, data) {
			if (err)
				reject(err);
			else {
				console.log("Remove user")
				resolve();
			}
		});
	})
}

// Cue code

var getCue = function() {
	console.log("getCue")
	return new Promise(function(resolve, reject) {
		Cue.find({}).exec(function(err, videos) {
			console.log(videos)
			if (err) {
				reject(err);
			} else {
				// io.sockets.emit('send cue', videos); NEED TO DO THIS ELSEWHERE
				resolve(videos);
			}
		})
	})
}

var addToCue = function(id, title, user) {
	console.log("Add to cue")
	return new Promise(function(resolve, reject) {
		var video = new Cue();
		console.log(title)
		video.id = id;
		video.title = title;
		video.user.name = user;
		video.save(function(err, data) {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	})
}

var removeFromCue = function(id) {
	console.log("Remove video")
	return new Promise(function(resolve, reject) {
		Cue.find({'id' : id}).remove(function(err, data) {
			if (err)
				reject(err);
			else {
				console.log("Remove video resolve")
				resolve();
			}
		});
	})
}

// Vibe code

var changeVibe = function(vibe, name) {
	if (vibe === "good") {
		console.log("Good vibe")
		return new Promise(function(resolve, reject) {
			User.findOneAndUpdate({ 'name': name}, { $inc: { vibes: 1 } }, { new: true }, function(err, doc) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
	if (vibe === "bad") {
		console.log("Good vibe")
		return new Promise(function(resolve, reject) {
			User.findOneAndUpdate({ 'name': name}, { $inc: { vibes: -1 } }, { new: true }, function(err, doc) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
}
