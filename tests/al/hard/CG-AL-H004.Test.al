codeunit 80004 "CG-AL-H004 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        Calculator: Codeunit "CG Priority Calculator";

    [Test]
    procedure TestGetPriorityScore_None()
    var
        Score: Integer;
    begin
        Score := Calculator.GetPriorityScore("CG Priority Level"::None);
        Assert.AreEqual(0, Score, 'None should have ordinal 0');
    end;

    [Test]
    procedure TestGetPriorityScore_Low()
    var
        Score: Integer;
    begin
        Score := Calculator.GetPriorityScore("CG Priority Level"::Low);
        Assert.AreEqual(10, Score, 'Low should have ordinal 10');
    end;

    [Test]
    procedure TestGetPriorityScore_Medium()
    var
        Score: Integer;
    begin
        Score := Calculator.GetPriorityScore("CG Priority Level"::Medium);
        Assert.AreEqual(20, Score, 'Medium should have ordinal 20');
    end;

    [Test]
    procedure TestGetPriorityScore_High()
    var
        Score: Integer;
    begin
        Score := Calculator.GetPriorityScore("CG Priority Level"::High);
        Assert.AreEqual(50, Score, 'High should have ordinal 50');
    end;

    [Test]
    procedure TestGetPriorityScore_Critical()
    var
        Score: Integer;
    begin
        Score := Calculator.GetPriorityScore("CG Priority Level"::Critical);
        Assert.AreEqual(100, Score, 'Critical should have ordinal 100');
    end;

    [Test]
    procedure TestGetNextHigherPriority_NoneToLow()
    var
        Result: Enum "CG Priority Level";
    begin
        Result := Calculator.GetNextHigherPriority("CG Priority Level"::None);
        Assert.AreEqual("CG Priority Level"::Low, Result, 'None should go to Low');
    end;

    [Test]
    procedure TestGetNextHigherPriority_LowToMedium()
    var
        Result: Enum "CG Priority Level";
    begin
        Result := Calculator.GetNextHigherPriority("CG Priority Level"::Low);
        Assert.AreEqual("CG Priority Level"::Medium, Result, 'Low should go to Medium');
    end;

    [Test]
    procedure TestGetNextHigherPriority_MediumToHigh()
    var
        Result: Enum "CG Priority Level";
    begin
        Result := Calculator.GetNextHigherPriority("CG Priority Level"::Medium);
        Assert.AreEqual("CG Priority Level"::High, Result, 'Medium should go to High');
    end;

    [Test]
    procedure TestGetNextHigherPriority_HighToCritical()
    var
        Result: Enum "CG Priority Level";
    begin
        Result := Calculator.GetNextHigherPriority("CG Priority Level"::High);
        Assert.AreEqual("CG Priority Level"::Critical, Result, 'High should go to Critical');
    end;

    [Test]
    procedure TestGetNextHigherPriority_CriticalStays()
    var
        Result: Enum "CG Priority Level";
    begin
        Result := Calculator.GetNextHigherPriority("CG Priority Level"::Critical);
        Assert.AreEqual("CG Priority Level"::Critical, Result, 'Critical should stay Critical');
    end;

    [Test]
    procedure TestComparePriorities_LessThan()
    var
        Result: Integer;
    begin
        Result := Calculator.ComparePriorities("CG Priority Level"::Low, "CG Priority Level"::High);
        Assert.AreEqual(-1, Result, 'Low < High should return -1');
    end;

    [Test]
    procedure TestComparePriorities_Equal()
    var
        Result: Integer;
    begin
        Result := Calculator.ComparePriorities("CG Priority Level"::Medium, "CG Priority Level"::Medium);
        Assert.AreEqual(0, Result, 'Medium = Medium should return 0');
    end;

    [Test]
    procedure TestComparePriorities_GreaterThan()
    var
        Result: Integer;
    begin
        Result := Calculator.ComparePriorities("CG Priority Level"::Critical, "CG Priority Level"::None);
        Assert.AreEqual(1, Result, 'Critical > None should return 1');
    end;

    [Test]
    procedure TestComparePriorities_NonAdjacentLevels()
    var
        Result: Integer;
    begin
        // Test that comparison uses ordinal, not enum index
        Result := Calculator.ComparePriorities("CG Priority Level"::Medium, "CG Priority Level"::Critical);
        Assert.AreEqual(-1, Result, 'Medium (20) < Critical (100) should return -1');
    end;
}
