JS Kim1
=======

This is a somewhat functional Kim1 simluator running in HTML5/JS.  This allows you to write and execute 6502 machine code in the most inefficient way possible.  It's quite a bit of fun.

You can view a live demo at http://www.robsayers.com/jskim1/

How to use this?
----------------

I recommend reading [http://users.telenet.be/kim1-6502/6502/fbok.html](The First Book of Kim),  a pretty good book on the device that should get you familiar with its operation.  Feel free to ignore the section on setting vectors.  A lot of machine specific functions do not yet work, so interupts and IO specific things in particular do not work.  Any generic 6502 code I have entered has run fine however. 

To get started you will first press "RS"  (reset) which will give you a fresh start.  Then hit "AD" (address) and enter the address where you want your first instruction to go.  Once this is entered, hit "DA" (data) and enter the 8 bit value for that location.  Hitting "+" will advance you to the next location, but still in data mode, so you can simply enter your next instruction or operand.  The basic example from the book simply lets you swap values in two memory locations.  

   
    0200 A5 10    START LDA 10   address 10 to A
    0202 A6 11          LDX 11   address 11 to x
    0204 85 11          STA 11   A to address 11
    0206 86 10          STX 10   X to address 10
    0208 00             BRK      stop the program


Using the first line as an example:  the 0200 is the memory location we will use,  A5 is our instruction... in assembly it means LDA, or "Load the A register with the value found at a specific address, and 10 is the memory address we want to read the value of.  The columns after that are simply the assembly langauge in human readable format.

So to run this program you would start the simulator, then type the following:

    [RS] 
    [AD] 0 2 0 0 [DA] A5 [+] 10 [+]
    A6 [+] 11 [+]
    85 [+] 11 [+]
    86 [+] 10 [+]
    00

And your program will be ready... but first we need to put some data in locations 10 and 11.  So then we type:

    [AD] 0 0 1 0 
    [DA] 22 [+] 33

And that stores the hex values 22 and 33 in those locations.

Now type [AD] 0 2 0 0, and then hit [GO]

Once this is done, the display should show "0208 00" which is where the program halted.  Now use your [AD] button to view locations 0010 and 0011 again,  the values should be reversed.

What good is this?
------------------

I actually built this in an attempt to win fame and fortune in the [http://www.retrochallenge.org](RetroChallenge 2013) contest.  That said, I think it's a neat tool to see that there's even a lower langauge than assembly.  It also helps you understand how much work your assembler does for you.  LDA $01, LDA $0001, and LDA #$01 are all different instructions inside the CPU, despite the fact we give one name to all of them.

What is left to do?
-------------------

Unfortunately very few machine specific functions work,  on a real device, hitting a button triggers an interrupt so you can actually enter input while a program is running and do something with it.  Also, each segment of each digit is independently controllable which lets you do some neat things.  None of those things work in the simulator however.  The entore stock ROM is loaded up, but I doubt many of the subroutines would have much effect since no real hardware is emulated correctly.

The one machine specific feature that does work is the register storage buffer, a handfull of addresses that let you read the Accumulator, X, Y, Program counter, and status registers:

    00EF: PCL - Program Counter - Low Order Byte    
    00F0: PGH - Program Counter - High Order Byte   
    00F1: P   - Status Register                     
    00F2: SF  - Stack Pointer                       
    00F3: A   - Accumulator                         
    00F4: Y   - Y-Index Register                    
    00F5: X   - X-Index Register       

So if you  load the x register with a value, you can simply view location 00F5 to see what that value is.  These locations are merely copies, and you can't set values here yourself.

Credits
-------

* Stian Soreng  http://www.6502asm.com/  For originally writting the JS 6502 Emulation code that is the heart of this simulator
* Nick Morgan http://skilldrick.github.io/easy6502/index.html For his modification to Stian's code, I ultimatley used his version as a base for my changes
* Rudiger Appel Http://www.3quarks.com/en/SegmentDisplay/index.html For the 7 segment display library
