#! /usr/bin/env node

const crypto = require("crypto");
const { networks, initEccLib } = require("bitcoinjs-lib");
const ecc = require("@bitcoinerlab/secp256k1");
const { ECPairFactory } = require("ecpair");
const { BIP32Factory } = require("bip32");
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
initEccLib(ecc);

const testnet = networks.testnet;
const mainnet = networks.bitcoin;
const prefixes = new Map([
	['tpub', { bip32: { public: 0x043587CF, private: 0x04358394 }, network: testnet, descOpen: 'pkh(', descClose: ')' }],
	['upub', { bip32: { public: 0x044a5262, private: 0x044a4e28 }, network: testnet, descOpen: 'sh(wpkh(', descClose: '))' }],
	['vpub', { bip32: { public: 0x045f1cf6, private: 0x045f18bc }, network: testnet, descOpen: 'wpkh(', descClose: ')' }],
	['xpub', { bip32: { public: 0x0488B21E, private: 0x0488ADE4 }, network: mainnet, descOpen: 'pkh(', descClose: ')' }],
	['ypub', { bip32: { public: 0x049d7cb2, private: 0x049d7878 }, network: mainnet, descOpen: 'sh(wpkh(', descClose: '))' }],
	['zpub', { bip32: { public: 0x04b24746, private: 0x04b2430c }, network: mainnet, descOpen: 'wpkh(', descClose: ')' }],
]);

const sparrow = 'sparrow';
const electrum = 'electrum';
const err = 'err';

document.querySelector('#go').addEventListener('click', () => {
	const xpubStr = document.querySelector('#xpub').value;
	const wif = document.querySelector('#wif').value;
	
	if (!xpubStr || !wif) {
		print(err, 'Invalid input');
		return;
	}

	const prefix = prefixes.get(xpubStr.substring(0, 4));
	const network = {...prefix.network};
	network.bip32 = prefix.bip32;

	const childPrivKey = ECPair.fromWIF(wif, network).privateKey;
	const bigPrivKey = BigInt(`0x${childPrivKey.toString('hex')}`);

	let xpub = bip32.fromBase58(xpubStr, network);
	let recvXpub = xpub.derive(0);

	let privFound;

	const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
	const limit = 20;

	// find the private key index
	for (let index = 0; index < limit; index++) {
		console.log(`index: ${index}`);
		let bufIndex = Buffer.alloc(4);
		bufIndex.writeInt32BE(index);

		let data = Buffer.concat([recvXpub.publicKey, bufIndex]);
		let hmac = crypto.createHmac('sha512', recvXpub.chainCode).update(data).digest();

		let left = hmac.subarray(0, 32);
		let bigLeft = BigInt(`0x${left.toString('hex')}`);
		
		let calcKey = (bigPrivKey - bigLeft) % N;
		if (calcKey < 0n) {
			calcKey += N;
		}

		let calcHex = calcKey.toString(16).padStart(64, '0');
		let calcBuffer = Buffer.from(calcHex, 'hex');

		let parentPrivKey = ECPair.fromPrivateKey(calcBuffer, { network: network });
		let pubkey = parentPrivKey.publicKey;
		if (pubkey.equals(recvXpub.publicKey)) {
			console.log(`found`);
			privFound = parentPrivKey;
			break;
		}
	}

	if (!privFound) {
		console.log('not found');
		print(err, 'Data does not match. Either this private key is not part of this xpub or it\'s too deep');
		return;
	}

	const xprv = bip32.fromPrivateKey(privFound.privateKey, recvXpub.chainCode, network);
	const bigParentPrivKey = BigInt(`0x${xprv.privateKey.toString('hex')}`);

	let data = Buffer.concat([xpub.publicKey, Buffer.alloc(4)]);
	let hmac = crypto.createHmac('sha512', xpub.chainCode).update(data).digest();
	let left = hmac.subarray(0, 32);
	let bigLeft = BigInt(`0x${left.toString('hex')}`);
	
	let calcKey = (bigParentPrivKey - bigLeft) % N;
	if (calcKey < 0n) {
		calcKey += N;
	}
	
	let calcHex = calcKey.toString(16).padStart(64, '0');
	let calcBuffer = Buffer.from(calcHex, 'hex');

	let parentXprv = bip32.fromPrivateKey(calcBuffer, xpub.chainCode, network);
	console.log(parentXprv.toBase58());
	print(electrum, parentXprv.toBase58());

	let stdXprv = bip32.fromPrivateKey(parentXprv.privateKey, parentXprv.chainCode, prefix.network); // use standard xprv
	console.log(stdXprv.toBase58());

	let str = stdXprv.toBase58();
	let output = `${prefix.descOpen}${str}/0/*${prefix.descClose}`;
	console.log(output);
	print(sparrow, output);
});

document.querySelector('#clear').addEventListener('click', () => {
	document.querySelector('#xpub').value = '';
	document.querySelector('#wif').value = '';
	document.querySelector('#electrum').innerHTML = '';
	document.querySelector('#sparrow').innerHTML = '';
	document.querySelector('#err').innerHTML = '';
});

const print = (area, msg) => {
	const outputArea = document.querySelector(`#${area}`);
	outputArea.innerHTML = '';
	const span = document.createElement('span');
	span.style.border = '5px dotted black';
	span.style.padding = '5px';
	span.innerHTML = msg;
	outputArea.append(span);
};