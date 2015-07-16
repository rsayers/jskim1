/*
*  6502 assembler and simulator in Javascript
*  (C)2006-2010 Stian Soreng - www.6502asm.com
*
*  Adapted by Nick Morgan
*  https://github.com/skilldrick/6502js
*
*  Further Adapted by Rob Sayers
*  http://www.robsayers.com/kim1.html 
*
*  Released under the GNU General Public License
*  see http://gnu.org/licenses/gpl.html
*/


var message=console.log;

    function addr2hex(addr) {
	return num2hex((addr >> 8) & 0xff) + num2hex(addr & 0xff);
    }

    function num2hex(nr) {
	var str = "0123456789abcdef";
	var hi = ((nr & 0xf0) >> 4);
	var lo = (nr & 15);
	return str.substring(hi, hi + 1) + str.substring(lo, lo + 1);
    }

 function Memory() {
	var memArray = new Array(0x600);

	function set(addr, val) {
	    return memArray[addr] = val;
	}

	function get(addr) {
	    return memArray[addr];
	}

	function getWord(addr) {
	    return get(addr) + (get(addr + 1) << 8);
	}

	function dump(){
	    return memArray;
	}

	// storeByte() - Poke a byte, don't touch any registers
        function storeByte(addr,val){
	    return set(addr,val);
	}

	// storeKeypress() - Store keycode in ZP $ff
	function storeKeypress(e) {
	    value = e.which;
	    memory.storeByte(0xff, value);
	}

	function format(start, length) {
	    var html = '';
	    var n;

	    for (var x = 0; x < length; x++) {
		if ((x & 15) === 0) {
		    if (x > 0) { html += "\n"; }
		    n = (start + x);
		    html += num2hex(((n >> 8) & 0xff));
		    html += num2hex((n & 0xff));
		    html += ": ";
		}
		html += num2hex(memory.get(start + x));
		html += " ";
	    }
	    return html;
	}

	return {
	    set: set,
		get: get,
	        storeByte:storeByte,
		getWord: getWord,
		storeKeypress: storeKeypress,
		format: format,
		dump:dump
		};
    }


    function Simulator() {
	var regA = 0;
	var regX = 0;
	var regY = 0;
	var regP = 0;
	var regPC = 0x200;
	var regSP = 0xff;
	var codeRunning = false;
	var debug = false;
	var monitoring = false;
	var executeId;

	//set zero and negative processor flags based on result
	function setNVflags(value) {
	    if (value) {
		regP &= 0xfd;
	    } else {
		regP |= 0x02;
	    }
	    if (value & 0x80) {
		regP |= 0x80;
	    } else {
		regP &= 0x7f;
	    }
	}

	function setCarryFlagFromBit0(value) {
	    regP = (regP & 0xfe) | (value & 1);
	}

	function setCarryFlagFromBit7(value) {
	    regP = (regP & 0xfe) | ((value >> 7) & 1);
	}

	function setNVflagsForRegA() {
	    setNVflags(regA);
	}

	function setNVflagsForRegX() {
	    setNVflags(regX);
	}

	function setNVflagsForRegY() {
	    setNVflags(regY);
	}

	var ORA = setNVflagsForRegA;
	var AND = setNVflagsForRegA;
	var EOR = setNVflagsForRegA;
	var ASL = setNVflags;
	var LSR = setNVflags;
	var ROL = setNVflags;
	var ROR = setNVflags;
	var LDA = setNVflagsForRegA;
	var LDX = setNVflagsForRegX;
	var LDY = setNVflagsForRegY;

	function BIT(value) {
	    if (value & 0x80) {
		regP |= 0x80;
	    } else {
		regP &= 0x7f;
	    }
	    if (value & 0x40) {
		regP |= 0x40;
	    } else {
		regP &= ~0x40;
	    }
	    if (regA & value) {
		regP &= 0xfd;
	    } else {
		regP |= 0x02;
	    }
	}

	function CLC() {
	    regP &= 0xfe;
	}

	function SEC() {
	    regP |= 1;
	}


	function CLV() {
	    regP &= 0xbf;
	}

	function setOverflow() {
	    regP |= 0x40;
	}

	function DEC(addr) {
	    var value = memory.get(addr);
	    value--;
	    value &= 0xff;
	    memory.storeByte(addr, value);
	    setNVflags(value);
	}

	function INC(addr) {
	    var value = memory.get(addr);
	    value++;
	    value &= 0xff;
	    memory.storeByte(addr, value);
	    setNVflags(value);
	}

	function jumpBranch(offset) {
	    if (offset > 0x7f) {
		regPC = (regPC - (0x100 - offset));
	    } else {
		regPC = (regPC + offset);
	    }
	}

	function overflowSet() {
	    return regP & 0x40;
	}

	function decimalMode() {
	    return regP & 8;
	}

	function carrySet() {
	    return regP & 1;
	}

	function negativeSet() {
	    return regP & 0x80;
	}

	function zeroSet() {
	    return regP & 0x02;
	}

	function doCompare(reg, val) {
	    if (reg >= val) {
		SEC();
	    } else {
		CLC();
	    }
	    val = (reg - val);
	    setNVflags(val);
	}

	function testSBC(value) {
	    var tmp, w;
	    if ((regA ^ value) & 0x80) {
		setOverflow();
	    } else {
		CLV();
	    }

	    if (decimalMode()) {
		tmp = 0xf + (regA & 0xf) - (value & 0xf) + carrySet();
		if (tmp < 0x10) {
		    w = 0;
		    tmp -= 6;
		} else {
		    w = 0x10;
		    tmp -= 0x10;
		}
		w += 0xf0 + (regA & 0xf0) - (value & 0xf0);
		if (w < 0x100) {
		    CLC();
		    if (overflowSet() && w < 0x80) { CLV(); }
		    w -= 0x60;
		} else {
		    SEC();
		    if (overflowSet() && w >= 0x180) { CLV(); }
		}
		w += tmp;
	    } else {
		w = 0xff + regA - value + carrySet();
		if (w < 0x100) {
		    CLC();
		    if (overflowSet() && w < 0x80) { CLV(); }
		} else {
		    SEC();
		    if (overflowSet() && w >= 0x180) { CLV(); }
		}
	    }
	    regA = w & 0xff;
	    setNVflagsForRegA();
	}

	function testADC(value) {
	    var tmp;
	    if ((regA ^ value) & 0x80) {
		CLV();
	    } else {
		setOverflow();
	    }

	    if (decimalMode()) {
		tmp = (regA & 0xf) + (value & 0xf) + carrySet();
		if (tmp >= 10) {
		    tmp = 0x10 | ((tmp + 6) & 0xf);
		}
		tmp += (regA & 0xf0) + (value & 0xf0);
		if (tmp >= 160) {
		    SEC();
		    if (overflowSet() && tmp >= 0x180) { CLV(); }
		    tmp += 0x60;
		} else {
		    CLC();
		    if (overflowSet() && tmp < 0x80) { CLV(); }
		}
	    } else {
		tmp = regA + value + carrySet();
		if (tmp >= 0x100) {
		    SEC();
		    if (overflowSet() && tmp >= 0x180) { CLV(); }
		} else {
		    CLC();
		    if (overflowSet() && tmp < 0x80) { CLV(); }
		}
	    }
	    regA = tmp & 0xff;
	    setNVflagsForRegA();
	}

	var instructions = {
	    i00: function () {
		codeRunning = false;
		//BRK
	    },

	    i01: function () {
		var zp = (popByte() + regX) & 0xff;
		var addr = memory.getWord(zp);
		var value = memory.get(addr);
		regA |= value;
		ORA();
	    },

	    i05: function () {
		var zp = popByte();
		regA |= memory.get(zp);
		ORA();
	    },

	    i06: function () {
		var zp = popByte();
		var value = memory.get(zp);
		setCarryFlagFromBit7(value);
		value = value << 1;
		memory.storeByte(zp, value);
		ASL(value);
	    },

	    i08: function () {
		stackPush(regP | 0x30);
		//PHP
	    },

	    i09: function () {
		regA |= popByte();
		ORA();
	    },

	    i0a: function () {
		setCarryFlagFromBit7(regA);
		regA = (regA << 1) & 0xff;
		ASL(regA);
	    },

	    i0d: function () {
		regA |= memory.get(popWord());
		ORA();
	    },

	    i0e: function () {
		var addr = popWord();
		var value = memory.get(addr);
		setCarryFlagFromBit7(value);
		value = value << 1;
		memory.storeByte(addr, value);
		ASL(value);
	    },

	    i10: function () {
		var offset = popByte();
		if (!negativeSet()) { jumpBranch(offset); }
		//BPL
	    },

	    i11: function () {
		var zp = popByte();
		var value = memory.getWord(zp) + regY;
		regA |= memory.get(value);
		ORA();
	    },

	    i15: function () {
		var addr = (popByte() + regX) & 0xff;
		regA |= memory.get(addr);
		ORA();
	    },

	    i16: function () {
		var addr = (popByte() + regX) & 0xff;
		var value = memory.get(addr);
		setCarryFlagFromBit7(value);
		value = value << 1;
		memory.storeByte(addr, value);
		ASL(value);
	    },

	    i18: function () {
		CLC();
	    },

	    i19: function () {
		var addr = popWord() + regY;
		regA |= memory.get(addr);
		ORA();
	    },

	    i1d: function () {
		var addr = popWord() + regX;
		regA |= memory.get(addr);
		ORA();
	    },

	    i1e: function () {
		var addr = popWord() + regX;
		var value = memory.get(addr);
		setCarryFlagFromBit7(value);
		value = value << 1;
		memory.storeByte(addr, value);
		ASL(value);
	    },

	    i20: function () {
		var addr = popWord();
		console.log("addr: "+addr);
		var currAddr = regPC - 1;
		console.log("curaddr: "+currAddr);
		stackPush(((currAddr >> 8) & 0xff));
		stackPush((currAddr & 0xff));
		regPC = addr;
		//JSR
	    },

	    i21: function () {
		var zp = (popByte() + regX) & 0xff;
		var addr = memory.getWord(zp);
		var value = memory.get(addr);
		regA &= value;
		AND();
	    },

	    i24: function () {
		var zp = popByte();
		var value = memory.get(zp);
		BIT(value);
	    },

	    i25: function () {
		var zp = popByte();
		regA &= memory.get(zp);
		AND();
	    },

	    i26: function () {
		var sf = carrySet();
		var addr = popByte();
		var value = memory.get(addr);
		setCarryFlagFromBit7(value);
		value = value << 1;
		value |= sf;
		memory.storeByte(addr, value);
		ROL(value);
	    },

	    i28: function () {
		regP = stackPop() | 0x30; // There is no B bit!
		//PLP
	    },

	    i29: function () {
		regA &= popByte();
		AND();
	    },

	    i2a: function () {
		var sf = carrySet();
		setCarryFlagFromBit7(regA);
		regA = (regA << 1) & 0xff;
		regA |= sf;
		ROL(regA);
	    },

	    i2c: function () {
		var value = memory.get(popWord());
		BIT(value);
	    },

	    i2d: function () {
		var value = memory.get(popWord());
		regA &= value;
		AND();
	    },

	    i2e: function () {
		var sf = carrySet();
		var addr = popWord();
		var value = memory.get(addr);
		setCarryFlagFromBit7(value);
		value = value << 1;
		value |= sf;
		memory.storeByte(addr, value);
		ROL(value);
	    },

	    i30: function () {
		var offset = popByte();
		if (negativeSet()) { jumpBranch(offset); }
		//BMI
	    },

	    i31: function () {
		var zp = popByte();
		var value = memory.getWord(zp) + regY;
		regA &= memory.get(value);
		AND();
	    },

	    i35: function () {
		var addr = (popByte() + regX) & 0xff;
		regA &= memory.get(addr);
		AND();
	    },

	    i36: function () {
		var sf = carrySet();
		var addr = (popByte() + regX) & 0xff;
		var value = memory.get(addr);
		setCarryFlagFromBit7(value);
		value = value << 1;
		value |= sf;
		memory.storeByte(addr, value);
		ROL(value);
	    },

	    i38: function () {
		SEC();
	    },

	    i39: function () {
		var addr = popWord() + regY;
		var value = memory.get(addr);
		regA &= value;
		AND();
	    },

	    i3d: function () {
		var addr = popWord() + regX;
		var value = memory.get(addr);
		regA &= value;
		AND();
	    },

	    i3e: function () {
		var sf = carrySet();
		var addr = popWord() + regX;
		var value = memory.get(addr);
		setCarryFlagFromBit7(value);
		value = value << 1;
		value |= sf;
		memory.storeByte(addr, value);
		ROL(value);
	    },

	    i40: function () {
		regP = stackPop() | 0x30; // There is no B bit!
		regPC = stackPop() | (stackPop() << 8);
		//RTI
	    },

	    i41: function () {
		var zp = (popByte() + regX) & 0xff;
		var value = memory.getWord(zp);
		regA ^= memory.get(value);
		EOR();
	    },

	    i45: function () {
		var addr = popByte() & 0xff;
		var value = memory.get(addr);
		regA ^= value;
		EOR();
	    },

	    i46: function () {
		var addr = popByte() & 0xff;
		var value = memory.get(addr);
		setCarryFlagFromBit0(value);
		value = value >> 1;
		memory.storeByte(addr, value);
		LSR(value);
	    },

	    i48: function () {
		stackPush(regA);
		//PHA
	    },

	    i49: function () {
		regA ^= popByte();
		EOR();
	    },

	    i4a: function () {
		setCarryFlagFromBit0(regA);
		regA = regA >> 1;
		LSR(regA);
	    },

	    i4c: function () {
		regPC = popWord();
		console.log("Jumping to :"+parseInt(regPC,16));
		//JMP
	    },

	    i4d: function () {
		var addr = popWord();
		var value = memory.get(addr);
		regA ^= value;
		EOR();
	    },

	    i4e: function () {
		var addr = popWord();
		var value = memory.get(addr);
		setCarryFlagFromBit0(value);
		value = value >> 1;
		memory.storeByte(addr, value);
		LSR(value);
	    },

	    i50: function () {
		var offset = popByte();
		if (!overflowSet()) { jumpBranch(offset); }
		//BVC
	    },

	    i51: function () {
		var zp = popByte();
		var value = memory.getWord(zp) + regY;
		regA ^= memory.get(value);
		EOR();
	    },

	    i55: function () {
		var addr = (popByte() + regX) & 0xff;
		regA ^= memory.get(addr);
		EOR();
	    },

	    i56: function () {
		var addr = (popByte() + regX) & 0xff;
		var value = memory.get(addr);
		setCarryFlagFromBit0(value);
		value = value >> 1;
		memory.storeByte(addr, value);
		LSR(value);
	    },

	    i58: function () {
		regP &= ~0x04;
		throw new Error("Interrupts not implemented");
		//CLI
	    },

	    i59: function () {
		var addr = popWord() + regY;
		var value = memory.get(addr);
		regA ^= value;
		EOR();
	    },

	    i5d: function () {
		var addr = popWord() + regX;
		var value = memory.get(addr);
		regA ^= value;
		EOR();
	    },

	    i5e: function () {
		var addr = popWord() + regX;
		var value = memory.get(addr);
		setCarryFlagFromBit0(value);
		value = value >> 1;
		memory.storeByte(addr, value);
		LSR(value);
	    },

	    i60: function () {
		regPC = (stackPop() | (stackPop() << 8)) + 1;
		//RTS
	    },

	    i61: function () {
		var zp = (popByte() + regX) & 0xff;
		var addr = memory.getWord(zp);
		var value = memory.get(addr);
		testADC(value);
		//ADC
	    },

	    i65: function () {
		var addr = popByte();
		var value = memory.get(addr);
		testADC(value);
		//ADC
	    },

	    i66: function () {
		var sf = carrySet();
		var addr = popByte();
		var value = memory.get(addr);
		setCarryFlagFromBit0(value);
		value = value >> 1;
		if (sf) { value |= 0x80; }
		memory.storeByte(addr, value);
		ROR(value);
	    },

	    i68: function () {
		regA = stackPop();
		setNVflagsForRegA();
		//PLA
	    },

	    i69: function () {
		var value = popByte();
		testADC(value);

		//ADC
	    },

	    i6a: function () {
		var sf = carrySet();
		setCarryFlagFromBit0(regA);
		regA = regA >> 1;
		if (sf) { regA |= 0x80; }
		ROR(regA);
	    },

	    i6c: function () {
		regPC = memory.getWord(popWord());
		//JMP
	    },

	    i6d: function () {
		var addr = popWord();
		var value = memory.get(addr);
		testADC(value);
		//ADC
	    },

	    i6e: function () {
		var sf = carrySet();
		var addr = popWord();
		var value = memory.get(addr);
		setCarryFlagFromBit0(value);
		value = value >> 1;
		if (sf) { value |= 0x80; }
		memory.storeByte(addr, value);
		ROR(value);
	    },

	    i70: function () {
		var offset = popByte();
		if (overflowSet()) { jumpBranch(offset); }
		//BVS
	    },

	    i71: function () {
		var zp = popByte();
		var addr = memory.getWord(zp);
		var value = memory.get(addr + regY);
		testADC(value);
		//ADC
	    },

	    i75: function () {
		var addr = (popByte() + regX) & 0xff;
		var value = memory.get(addr);
		testADC(value);
		//ADC
	    },

	    i76: function () {
		var sf = carrySet();
		var addr = (popByte() + regX) & 0xff;
		var value = memory.get(addr);
		setCarryFlagFromBit0(value);
		value = value >> 1;
		if (sf) { value |= 0x80; }
		memory.storeByte(addr, value);
		ROR(value);
	    },

	    i78: function () {
		regP |= 0x04;
		throw new Error("Interrupts not implemented");
		//SEI
	    },

	    i79: function () {
		var addr = popWord();
		var value = memory.get(addr + regY);
		testADC(value);
		//ADC
	    },

	    i7d: function () {
		var addr = popWord();
		var value = memory.get(addr + regX);
		testADC(value);
		//ADC
	    },

	    i7e: function () {
		var sf = carrySet();
		var addr = popWord() + regX;
		var value = memory.get(addr);
		setCarryFlagFromBit0(value);
		value = value >> 1;
		if (sf) { value |= 0x80; }
		memory.storeByte(addr, value);
		ROR(value);
	    },

	    i81: function () {
		var zp = (popByte() + regX) & 0xff;
		var addr = memory.getWord(zp);
		memory.storeByte(addr, regA);
		//STA
	    },

	    i84: function () {
		memory.storeByte(popByte(), regY);
		//STY
	    },

	    i85: function () {
		memory.storeByte(popByte(), regA);
		//STA
	    },

	    i86: function () {
		memory.storeByte(popByte(), regX);
		//STX
	    },

	    i88: function () {
		regY = (regY - 1) & 0xff;
		setNVflagsForRegY();
		//DEY
	    },

	    i8a: function () {
		regA = regX & 0xff;
		setNVflagsForRegA();
		//TXA
	    },

	    i8c: function () {
		memory.storeByte(popWord(), regY);
		//STY
	    },

	    i8d: function () {
		memory.storeByte(popWord(), regA);
		//STA
	    },

	    i8e: function () {
		memory.storeByte(popWord(), regX);
		//STX
	    },

	    i90: function () {
		var offset = popByte();
		if (!carrySet()) { jumpBranch(offset); }
		//BCC
	    },

	    i91: function () {
		var zp = popByte();
		var addr = memory.getWord(zp) + regY;
		memory.storeByte(addr, regA);
		//STA
	    },

	    i94: function () {
		memory.storeByte((popByte() + regX) & 0xff, regY);
		//STY
	    },

	    i95: function () {
		memory.storeByte((popByte() + regX) & 0xff, regA);
		//STA
	    },

	    i96: function () {
		memory.storeByte((popByte() + regY) & 0xff, regX);
		//STX
	    },

	    i98: function () {
		regA = regY & 0xff;
		setNVflagsForRegA();
		//TYA
	    },

	    i99: function () {
		memory.storeByte(popWord() + regY, regA);
		//STA
	    },

	    i9a: function () {
		regSP = regX & 0xff;
		//TXS
	    },

	    i9d: function () {
		var addr = popWord();
		memory.storeByte(addr + regX, regA);
		//STA
	    },

	    ia0: function () {
		regY = popByte();
		LDY();
	    },

	    ia1: function () {
		var zp = (popByte() + regX) & 0xff;
		var addr = memory.getWord(zp);
		regA = memory.get(addr);
		LDA();
	    },

	    ia2: function () {
		regX = popByte();
		LDX();
	    },

	    ia4: function () {
		regY = memory.get(popByte());
		LDY();
	    },

	    ia5: function () {
		regA = memory.get(popByte());
		LDA();
	    },

	    ia6: function () {
		regX = memory.get(popByte());
		console.log("x is now:" +regX);
		LDX();
	    },

	    ia8: function () {
		regY = regA & 0xff;
		setNVflagsForRegY();
		//TAY
	    },

	    ia9: function () {
		regA = popByte();
		LDA();
	    },

	    iaa: function () {
		regX = regA & 0xff;
		setNVflagsForRegX();
		//TAX
	    },

	    iac: function () {
		regY = memory.get(popWord());
		LDY();
	    },

	    iad: function () {
		regA = memory.get(popWord());
		LDA();
	    },

	    iae: function () {
		regX = memory.get(popWord());
		LDX();
	    },

	    ib0: function () {
		var offset = popByte();
		if (carrySet()) { jumpBranch(offset); }
		//BCS
	    },

	    ib1: function () {
		var zp = popByte();
		var addr = memory.getWord(zp) + regY;
		regA = memory.get(addr);
		LDA();
	    },

	    ib4: function () {
		regY = memory.get((popByte() + regX) & 0xff);
		LDY();
	    },

	    ib5: function () {
		regA = memory.get((popByte() + regX) & 0xff);
		LDA();
	    },

	    ib6: function () {
		regX = memory.get((popByte() + regY) & 0xff);
		LDX();
	    },

	    ib8: function () {
		CLV();
	    },

	    ib9: function () {
		var addr = popWord() + regY;
		regA = memory.get(addr);
		LDA();
	    },

	    iba: function () {
		regX = regSP & 0xff;
		LDX();
		//TSX
	    },

	    ibc: function () {
		var addr = popWord() + regX;
		regY = memory.get(addr);
		LDY();
	    },

	    ibd: function () {
		var addr = popWord() + regX;
		regA = memory.get(addr);
		LDA();
	    },

	    ibe: function () {
		var addr = popWord() + regY;
		regX = memory.get(addr);
		LDX();
	    },

	    ic0: function () {
		var value = popByte();
		doCompare(regY, value);
		//CPY
	    },

	    ic1: function () {
		var zp = (popByte() + regX) & 0xff;
		var addr = memory.getWord(zp);
		var value = memory.get(addr);
		doCompare(regA, value);
		//CPA
	    },

	    ic4: function () {
		var value = memory.get(popByte());
		doCompare(regY, value);
		//CPY
	    },

	    ic5: function () {
		var value = memory.get(popByte());
		doCompare(regA, value);
		//CPA
	    },

	    ic6: function () {
		var zp = popByte();
		DEC(zp);
	    },

	    ic8: function () {
		regY = (regY + 1) & 0xff;
		setNVflagsForRegY();
		//INY
	    },

	    ic9: function () {
		var value = popByte();
		doCompare(regA, value);
		//CMP
	    },

	    ica: function () {
		regX = (regX - 1) & 0xff;
		setNVflagsForRegX();
		//DEX
	    },

	    icc: function () {
		var value = memory.get(popWord());
		doCompare(regY, value);
		//CPY
	    },

	    icd: function () {
		var value = memory.get(popWord());
		doCompare(regA, value);
		//CPA
	    },

	    ice: function () {
		var addr = popWord();
		DEC(addr);
	    },

	    id0: function () {
		var offset = popByte();
		if (!zeroSet()) { jumpBranch(offset); }
		//BNE
	    },

	    id1: function () {
		var zp = popByte();
		var addr = memory.getWord(zp) + regY;
		var value = memory.get(addr);
		doCompare(regA, value);
		//CMP
	    },

	    id5: function () {
		var value = memory.get((popByte() + regX) & 0xff);
		doCompare(regA, value);
		//CMP
	    },

	    id6: function () {
		var addr = (popByte() + regX) & 0xff;
		DEC(addr);
	    },

	    id8: function () {
		regP &= 0xf7;
		//CLD
	    },

	    id9: function () {
		var addr = popWord() + regY;
		var value = memory.get(addr);
		doCompare(regA, value);
		//CMP
	    },

	    idd: function () {
		var addr = popWord() + regX;
		var value = memory.get(addr);
		doCompare(regA, value);
		//CMP
	    },

	    ide: function () {
		var addr = popWord() + regX;
		DEC(addr);
	    },

	    ie0: function () {
		var value = popByte();
		doCompare(regX, value);
		//CPX
	    },

	    ie1: function () {
		var zp = (popByte() + regX) & 0xff;
		var addr = memory.getWord(zp);
		var value = memory.get(addr);
		testSBC(value);
		//SBC
	    },

	    ie4: function () {
		var value = memory.get(popByte());
		doCompare(regX, value);
		//CPX
	    },

	    ie5: function () {
		var addr = popByte();
		var value = memory.get(addr);
		testSBC(value);
		//SBC
	    },

	    ie6: function () {
		var zp = popByte();
		INC(zp);
	    },

	    ie8: function () {
		regX = (regX + 1) & 0xff;
		setNVflagsForRegX();
		//INX
	    },

	    ie9: function () {
		var value = popByte();
		testSBC(value);
		//SBC
	    },

	    iea: function () {
		console.log("NOP");
		//NOP
	    },

	    iec: function () {
		var value = memory.get(popWord());
		doCompare(regX, value);
		//CPX
	    },

	    ied: function () {
		var addr = popWord();
		var value = memory.get(addr);
		testSBC(value);
		//SBC
	    },

	    iee: function () {
		var addr = popWord();
		INC(addr);
	    },

	    if0: function () {
		var offset = popByte();
		if (zeroSet()) { jumpBranch(offset); }
		//BEQ
	    },

	    if1: function () {
		var zp = popByte();
		var addr = memory.getWord(zp);
		var value = memory.get(addr + regY);
		testSBC(value);
		//SBC
	    },

	    if5: function () {
		var addr = (popByte() + regX) & 0xff;
		var value = memory.get(addr);
		testSBC(value);
		//SBC
	    },

	    if6: function () {
		var addr = (popByte() + regX) & 0xff;
		INC(addr);
	    },

	    if8: function () {
		regP |= 8;
		//SED
	    },

	    if9: function () {
		var addr = popWord();
		var value = memory.get(addr + regY);
		testSBC(value);
		//SBC
	    },

	    ifd: function () {
		var addr = popWord();
		var value = memory.get(addr + regX);
		testSBC(value);
		//SBC
	    },

	    ife: function () {
		var addr = popWord() + regX;
		INC(addr);
	    },

	    ierr: function () {
		message("Address $" + addr2hex(regPC) + " - unknown opcode");
		codeRunning = false;
	    }
	};

	function stackPush(value) {
	    console.log("stackPush: "+value);
	    memory.set((regSP & 0xff) + 0x100, value & 0xff);
	    regSP--;
	    if (regSP < 0) {
		regSP &= 0xff;
		message("6502 Stack filled! Wrapping...");
	    }
	}

	function stackPop() {
	    var value;
	    regSP++;
	    if (regSP >= 0x100) {
		regSP &= 0xff;
		message("6502 Stack emptied! Wrapping...");
	    }
	    value = memory.get(regSP + 0x100);
	    return value;
	}

	// popByte() - Pops a byte
	function popByte() {
	    return(memory.get(regPC++) & 0xff);
	}

	// popWord() - Pops a word using popByte() twice
	function popWord() {
	    return popByte() + (popByte() << 8);
	}

	// runBinary() - Executes the assembled code
	function runBinary() {
	    if (codeRunning) {
		// Switch OFF everything
		stop();
	
	    } else {
	
		codeRunning = true;
		executeId = setInterval(multiExecute, 15);
	    }
	}

	function multiExecute() {
	    if (!debug) {
		// use a prime number of iterations to avoid aliasing effects

		for (var w = 0; w < 97; w++) {
		    execute();
		}
	    }
	    updateDebugInfo();
	}


	function executeNextInstruction() {
	    var instructionName = popByte().toString(16).toLowerCase();
	    if (instructionName.length === 1) {
		instructionName = '0' + instructionName;
	    }
	    var instruction = instructions['i' + instructionName];
	    console.log("RUNNING: "+parseInt(regPC,16)+"::"+instructionName);
	    console.log("X before: "+regX);
	    kim.curaddr = regPC+1;
	    kim.update();
	    if (instruction) {
		instruction();
	    } else {
		instructions.ierr();
	    }
	    // Set the kim1 specific locations to reflect X,Y,A,PC, and statius registers
	    
	    console.log("X after: "+regX);
	    memory.set(0x00f3,regA);
	    memory.set(0x00f5,regX);
	    memory.set(0x00f4,regY);
	    memory.set(0x00f1,regP);
	    var pcStr = regPC.toString(16).split('');
	    var pcH = parseInt(pcStr[0]+pcStr[1],16);
	    var pcL = parseInt(pcStr[2]+pcStr[3],16);
	    memory.set(0x00ef,pcH);
	    memory.set(0x00f0,pcL);

	}

	function start(){
	    codeRunning = true;
	}
	// execute() - Executes one instruction.
	//             This is the main part of the CPU simulator.
	function execute(debugging) {
	    if (!codeRunning && !debugging) { return; }

	   // setRandomByte();
	    executeNextInstruction();

	    if ((regPC === 0) || (!codeRunning && !debugging)) {
		stop();
		codeRunning = false;
		message("X=$" + num2hex(regX));
		message("Program end at PC=$" + addr2hex(regPC - 1));
		kim.curaddr = regPC-1;
		kim.update();
		
	    }
	}

	function setRandomByte() {
	    memory.set(0xfe, Math.floor(Math.random() * 256));
	}

	function updateMonitor() {
	    if (monitoring) {
		var start = parseInt($node.find('.start').val(), 16);
		var length = parseInt($node.find('.length').val(), 16);
		if (start >= 0 && length > 0) {
		    $node.find('.monitor code').html(memory.format(start, length));
		}
	    }
	}

	// debugExec() - Execute one instruction and print values
	function debugExec() {
	    //if (codeRunning) {
	    execute(true);
	    //}
	    updateDebugInfo();
	}

	function updateDebugInfo() {
	    regs();
	    
	    updateMonitor();
	}

        function regs() {
	    var html = "A=$" + num2hex(regA) + " X=$" + num2hex(regX) + " Y=$" + num2hex(regY) + "\n";
	    html += "SP=$" + num2hex(regSP) + " PC=$" + addr2hex(regPC);
	    html += "\n";
	    html += "NV-BDIZC\n";
	    for (var i = 7; i >=0; i--) {
		html += regP >> i & 1;
	    }
	    console.log(html);
	}

	// gotoAddr() - Set PC to address (or address of label)
	function gotoAddr() {
	    var inp = prompt("Enter address or label", "");
	    var addr = 0;
	    if (labels.find(inp)) {
		addr = labels.getPC(inp);
	    } else {
		if (inp.match(/^0x[0-9a-f]{1,4}$/i)) {
		    inp = inp.replace(/^0x/, "");
		    addr = parseInt(inp, 16);
		} else if (inp.match(/^\$[0-9a-f]{1,4}$/i)) {
		    inp = inp.replace(/^\$/, "");
		    addr = parseInt(inp, 16);
		}
	    }
	    if (addr === 0) {
		message("Unable to find/parse given address/label");
	    } else {
		regPC = addr;
	    }
	    updateDebugInfo();
	}


	function stopDebugger() {
	    debug = false;
	}

	function enableDebugger() {
	    debug = true;
	    if (codeRunning) {
		updateDebugInfo();
	    }
	}

	// reset() - Reset CPU and memory.
	function reset() {
	    
	    for (var i = 0; i < 0x600; i++) { // clear ZP, stack and screen
		memory.set(i, 0x00);
	    }
	    regA = regX = regY = 0;
	    regPC = 0x200;
	    regSP = 0xff;
	    regP = 0x30;
	    updateDebugInfo();
	}

	function stop() {
	    codeRunning = false;
	    clearInterval(executeId);
	}

	function toggleMonitor() {
	    monitoring = !monitoring;
	}

	function setPC(addr){
	   
	    console.log("Changing PC to: "+addr);
	    regPC = addr;
	}

	function getPC(){
	    return regPC;
	}


	function isRunning(){
	    return codeRunning;
	}
	return {
	    runBinary: runBinary,
	    step: execute,
		enableDebugger: enableDebugger,
		stopDebugger: stopDebugger,
		debugExec: debugExec,
		gotoAddr: gotoAddr,
		reset: reset,
		stop: stop,
		regs:regs,
	        setPC:setPC,
	        start:start,
	        getPC:getPC,
	        isRunning: isRunning,
		toggleMonitor: toggleMonitor
		};
    }
