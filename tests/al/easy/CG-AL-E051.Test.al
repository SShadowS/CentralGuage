codeunit 80051 "CG-AL-E051 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        NumberSequence: Codeunit "CG Number Sequence";

    [Test]
    procedure TestIncrementByStep_BasicIncrement()
    var
        Result: Text;
    begin
        Result := NumberSequence.IncrementByStep('DOC-001', 1);

        Assert.AreEqual('DOC-002', Result, 'Should increment by 1');
    end;

    [Test]
    procedure TestIncrementByStep_IncrementByFive()
    var
        Result: Text;
    begin
        Result := NumberSequence.IncrementByStep('INV-0010', 5);

        Assert.AreEqual('INV-0015', Result, 'Should increment by 5');
    end;

    [Test]
    procedure TestIncrementByStep_IncrementByTen()
    var
        Result: Text;
    begin
        Result := NumberSequence.IncrementByStep('ORD-100', 10);

        Assert.AreEqual('ORD-110', Result, 'Should increment by 10');
    end;

    [Test]
    procedure TestIncrementByStep_LargeStep()
    var
        Result: Text;
    begin
        Result := NumberSequence.IncrementByStep('BATCH-0001', 100);

        Assert.AreEqual('BATCH-0101', Result, 'Should increment by 100');
    end;

    [Test]
    procedure TestGenerateSequence_ThreeItems()
    var
        Result: List of [Text];
    begin
        Result := NumberSequence.GenerateSequence('DOC-001', 3);

        Assert.AreEqual(3, Result.Count, 'Should have 3 items');
        Assert.AreEqual('DOC-001', Result.Get(1), 'First item should be DOC-001');
        Assert.AreEqual('DOC-002', Result.Get(2), 'Second item should be DOC-002');
        Assert.AreEqual('DOC-003', Result.Get(3), 'Third item should be DOC-003');
    end;

    [Test]
    procedure TestGenerateSequence_SingleItem()
    var
        Result: List of [Text];
    begin
        Result := NumberSequence.GenerateSequence('ABC-999', 1);

        Assert.AreEqual(1, Result.Count, 'Should have 1 item');
        Assert.AreEqual('ABC-999', Result.Get(1), 'Should be the start value');
    end;

    [Test]
    procedure TestGenerateSequence_FiveItems()
    var
        Result: List of [Text];
    begin
        Result := NumberSequence.GenerateSequence('REF-0050', 5);

        Assert.AreEqual(5, Result.Count, 'Should have 5 items');
        Assert.AreEqual('REF-0050', Result.Get(1), 'First item');
        Assert.AreEqual('REF-0054', Result.Get(5), 'Fifth item should be REF-0054');
    end;

    [Test]
    procedure TestGenerateBatchNumbers_BasicBatch()
    var
        Result: List of [Text];
    begin
        Result := NumberSequence.GenerateBatchNumbers('INV', 100, 3, 10);

        Assert.AreEqual(3, Result.Count, 'Should have 3 items');
        Assert.AreEqual('INV0100', Result.Get(1), 'First batch number');
        Assert.AreEqual('INV0110', Result.Get(2), 'Second batch number');
        Assert.AreEqual('INV0120', Result.Get(3), 'Third batch number');
    end;

    [Test]
    procedure TestGenerateBatchNumbers_IncrementByOne()
    var
        Result: List of [Text];
    begin
        Result := NumberSequence.GenerateBatchNumbers('PO', 1, 4, 1);

        Assert.AreEqual(4, Result.Count, 'Should have 4 items');
        Assert.AreEqual('PO0001', Result.Get(1), 'First number');
        Assert.AreEqual('PO0002', Result.Get(2), 'Second number');
        Assert.AreEqual('PO0003', Result.Get(3), 'Third number');
        Assert.AreEqual('PO0004', Result.Get(4), 'Fourth number');
    end;

    [Test]
    procedure TestGenerateBatchNumbers_LargeIncrement()
    var
        Result: List of [Text];
    begin
        Result := NumberSequence.GenerateBatchNumbers('SO', 1000, 3, 100);

        Assert.AreEqual(3, Result.Count, 'Should have 3 items');
        Assert.AreEqual('SO1000', Result.Get(1), 'First number');
        Assert.AreEqual('SO1100', Result.Get(2), 'Second number');
        Assert.AreEqual('SO1200', Result.Get(3), 'Third number');
    end;

    [Test]
    procedure TestDecrementValue_BasicDecrement()
    var
        Result: Text;
    begin
        Result := NumberSequence.DecrementValue('ORD-005');

        Assert.AreEqual('ORD-004', Result, 'Should decrement by 1');
    end;

    [Test]
    procedure TestDecrementValue_FromTen()
    var
        Result: Text;
    begin
        Result := NumberSequence.DecrementValue('DOC-010');

        Assert.AreEqual('DOC-009', Result, 'Should decrement from 010 to 009');
    end;

    [Test]
    procedure TestDecrementValue_FromHundred()
    var
        Result: Text;
    begin
        Result := NumberSequence.DecrementValue('REF-100');

        Assert.AreEqual('REF-099', Result, 'Should decrement from 100 to 099');
    end;

    [Test]
    procedure TestIncrementByStep_ZeroStep()
    var
        Result: Text;
    begin
        Result := NumberSequence.IncrementByStep('VAL-050', 0);

        Assert.AreEqual('VAL-050', Result, 'Zero step should not change value');
    end;

    [Test]
    procedure TestIncrementByStep_NegativeStep()
    var
        Result: Text;
    begin
        Result := NumberSequence.IncrementByStep('NUM-100', -5);

        Assert.AreEqual('NUM-095', Result, 'Negative step should decrement');
    end;
}
