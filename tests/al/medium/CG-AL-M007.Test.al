codeunit 80017 "CG-AL-M007 Test"
{
    // Tests for CG-AL-M007: Complex Report - Sales Performance Analysis
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibrarySales: Codeunit "Library - Sales";
        LibraryReportDataset: Codeunit "Library - Report Dataset";
        MockCalculator: Codeunit "CG-AL-M007 Mock Calculator";

    [Test]
    procedure TestReportExists()
    var
        SalesPerformanceAnalysis: Report "Sales Performance Analysis";
    begin
        // [SCENARIO] Sales Performance Analysis report exists with correct ID
        // [GIVEN] The report definition
        // [WHEN] We reference the report
        // [THEN] No compilation error occurs - report exists
        SalesPerformanceAnalysis.UseRequestPage(false);
    end;

    [Test]
    procedure TestReportRunsWithoutError()
    var
        Customer: Record Customer;
        SalesPerformanceAnalysis: Report "Sales Performance Analysis";
    begin
        // [SCENARIO] Report runs without error on valid data
        // [GIVEN] A customer record exists
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We run the report
        SalesPerformanceAnalysis.UseRequestPage(false);
        SalesPerformanceAnalysis.Run();

        // [THEN] No error occurs (if we reach this line, test passes)

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestRunningTotalsByCustomer()
    begin
        // [SCENARIO] Running totals by customer are calculated correctly
        // [GIVEN] Sales data for multiple customers
        MockCalculator.Initialize();
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM001', 10, 1000);
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM002', 5, 500);
        MockCalculator.AddSalesLine('CUST002', 'WEST', 'ITEM001', 20, 2000);

        // [WHEN] We get running totals
        // [THEN] Totals are accumulated correctly per customer
        Assert.AreEqual(1500, MockCalculator.GetRunningTotalByCustomer('CUST001'),
            'Running total for CUST001 should be 1500');
        Assert.AreEqual(2000, MockCalculator.GetRunningTotalByCustomer('CUST002'),
            'Running total for CUST002 should be 2000');
        Assert.AreEqual(0, MockCalculator.GetRunningTotalByCustomer('CUST999'),
            'Running total for non-existent customer should be 0');
    end;

    [Test]
    procedure TestRunningTotalsByRegion()
    begin
        // [SCENARIO] Running totals by region are calculated correctly
        // [GIVEN] Sales data across different regions
        MockCalculator.Initialize();
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM001', 10, 1000);
        MockCalculator.AddSalesLine('CUST002', 'EAST', 'ITEM002', 5, 500);
        MockCalculator.AddSalesLine('CUST003', 'WEST', 'ITEM001', 20, 2000);

        // [WHEN] We get running totals by region
        // [THEN] Totals are accumulated correctly per region
        Assert.AreEqual(1500, MockCalculator.GetRunningTotalByRegion('EAST'),
            'Running total for EAST region should be 1500');
        Assert.AreEqual(2000, MockCalculator.GetRunningTotalByRegion('WEST'),
            'Running total for WEST region should be 2000');
    end;

    [Test]
    procedure TestAverageOrderValueCalculation()
    begin
        // [SCENARIO] Average order value is calculated correctly
        // [GIVEN] Multiple orders with different values
        MockCalculator.Initialize();
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM001', 10, 100);
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM002', 5, 200);
        MockCalculator.AddSalesLine('CUST002', 'WEST', 'ITEM001', 20, 300);

        // [WHEN] We calculate average order value
        // [THEN] Average is (100 + 200 + 300) / 3 = 200
        Assert.AreEqual(200, MockCalculator.CalculateAverageOrderValue(),
            'Average order value should be 200');
    end;

    [Test]
    procedure TestAverageOrderValueWithNoOrders()
    begin
        // [SCENARIO] Average order value handles empty data
        // [GIVEN] No orders
        MockCalculator.Initialize();

        // [WHEN] We calculate average order value
        // [THEN] Result is 0 (no divide by zero error)
        Assert.AreEqual(0, MockCalculator.CalculateAverageOrderValue(),
            'Average order value with no orders should be 0');
    end;

    [Test]
    procedure TestCustomerRankingBySalesVolume()
    begin
        // [SCENARIO] Customers are ranked by sales volume
        // [GIVEN] Multiple customers with different sales volumes
        MockCalculator.Initialize();
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM001', 10, 500);   // Lowest
        MockCalculator.AddSalesLine('CUST002', 'WEST', 'ITEM001', 20, 2000);  // Highest
        MockCalculator.AddSalesLine('CUST003', 'EAST', 'ITEM002', 15, 1000);  // Middle

        // [WHEN] We get customer rankings
        // [THEN] Rankings reflect sales volume order
        Assert.AreEqual(1, MockCalculator.GetCustomerRank('CUST002'),
            'CUST002 with highest sales should be rank 1');
        Assert.AreEqual(2, MockCalculator.GetCustomerRank('CUST003'),
            'CUST003 with middle sales should be rank 2');
        Assert.AreEqual(3, MockCalculator.GetCustomerRank('CUST001'),
            'CUST001 with lowest sales should be rank 3');
    end;

    [Test]
    procedure TestCustomerRankForNonExistentCustomer()
    begin
        // [SCENARIO] Ranking handles non-existent customer
        // [GIVEN] Some customer sales data
        MockCalculator.Initialize();
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM001', 10, 1000);

        // [WHEN] We get rank for non-existent customer
        // [THEN] Rank is 0
        Assert.AreEqual(0, MockCalculator.GetCustomerRank('NOTEXIST'),
            'Non-existent customer should have rank 0');
    end;

    [Test]
    procedure TestTopProductsAnalysis()
    begin
        // [SCENARIO] Top performing product is identified by quantity sold
        // [GIVEN] Sales data for multiple products
        MockCalculator.Initialize();
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM001', 50, 500);
        MockCalculator.AddSalesLine('CUST002', 'WEST', 'ITEM002', 100, 1000);  // Most sold
        MockCalculator.AddSalesLine('CUST003', 'EAST', 'ITEM003', 25, 250);

        // [WHEN] We identify top product
        // [THEN] ITEM002 is the top product (100 units sold)
        Assert.AreEqual('ITEM002', MockCalculator.GetTopProduct(),
            'ITEM002 should be the top product');
        Assert.AreEqual(100, MockCalculator.GetProductSalesQuantity('ITEM002'),
            'ITEM002 should have 100 units sold');
    end;

    [Test]
    procedure TestYearOverYearComparison()
    begin
        // [SCENARIO] Year-over-year comparison calculates percentage change
        // [GIVEN] Current and previous year sales figures

        // [WHEN/THEN] Calculate YoY with growth
        Assert.AreEqual(50, MockCalculator.CalculateYoYComparison(150, 100),
            'Growth from 100 to 150 should be 50%');

        // [WHEN/THEN] Calculate YoY with decline
        Assert.AreEqual(-25, MockCalculator.CalculateYoYComparison(75, 100),
            'Decline from 100 to 75 should be -25%');

        // [WHEN/THEN] Calculate YoY from zero previous
        Assert.AreEqual(100, MockCalculator.CalculateYoYComparison(100, 0),
            'Growth from 0 should be 100%');

        // [WHEN/THEN] Calculate YoY with both zero
        Assert.AreEqual(0, MockCalculator.CalculateYoYComparison(0, 0),
            'No change from 0 to 0 should be 0%');
    end;

    [Test]
    procedure TestOrderFrequencyMetrics()
    begin
        // [SCENARIO] Order frequency is calculated as orders per day
        // [GIVEN] Order count and period duration

        // [WHEN/THEN] Calculate frequency with valid data
        Assert.AreEqual(0.5, MockCalculator.CalculateOrderFrequency(15, 30),
            '15 orders in 30 days should be 0.5 per day');

        // [WHEN/THEN] Calculate frequency with zero days
        Assert.AreEqual(0, MockCalculator.CalculateOrderFrequency(10, 0),
            'Order frequency with 0 days should be 0');
    end;

    [Test]
    procedure TestTotalSalesAggregation()
    begin
        // [SCENARIO] Total sales across all customers is aggregated
        // [GIVEN] Sales data for multiple customers
        MockCalculator.Initialize();
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM001', 10, 1000);
        MockCalculator.AddSalesLine('CUST002', 'WEST', 'ITEM002', 5, 500);
        MockCalculator.AddSalesLine('CUST003', 'EAST', 'ITEM003', 20, 2000);

        // [WHEN] We get total sales
        // [THEN] Total is sum of all sales
        Assert.AreEqual(3500, MockCalculator.GetTotalSales(),
            'Total sales should be 3500');
        Assert.AreEqual(3, MockCalculator.GetCustomerCount(),
            'Customer count should be 3');
    end;

    [Test]
    procedure TestReportWithCustomerFilter()
    var
        Customer: Record Customer;
        SalesHeader: Record "Sales Header";
        SalesLine: Record "Sales Line";
        Item: Record Item;
        LibraryInventory: Codeunit "Library - Inventory";
        SalesPerformanceAnalysis: Report "Sales Performance Analysis";
    begin
        // [SCENARIO] Report can be filtered by customer
        // [GIVEN] Customer with sales data
        LibrarySales.CreateCustomer(Customer);
        LibraryInventory.CreateItem(Item);
        LibrarySales.CreateSalesHeader(SalesHeader, SalesHeader."Document Type"::Order, Customer."No.");
        LibrarySales.CreateSalesLine(SalesLine, SalesHeader, SalesLine.Type::Item, Item."No.", 10);

        // [WHEN] We run report with customer filter
        Customer.SetRange("No.", Customer."No.");
        SalesPerformanceAnalysis.SetTableView(Customer);
        SalesPerformanceAnalysis.UseRequestPage(false);
        SalesPerformanceAnalysis.Run();

        // [THEN] Report completes without error (filtered execution)

        // Cleanup
        SalesHeader.Delete(true);
        Customer.Delete();
        Item.Delete();
    end;

    [Test]
    procedure TestGroupSubtotals()
    begin
        // [SCENARIO] Group subtotals accumulate correctly within regions
        // [GIVEN] Multiple sales within the same region
        MockCalculator.Initialize();
        MockCalculator.AddSalesLine('CUST001', 'NORTH', 'ITEM001', 10, 100);
        MockCalculator.AddSalesLine('CUST002', 'NORTH', 'ITEM002', 20, 200);
        MockCalculator.AddSalesLine('CUST003', 'NORTH', 'ITEM003', 30, 300);

        // [WHEN] We check region subtotal
        // [THEN] Subtotal reflects all sales in region
        Assert.AreEqual(600, MockCalculator.GetRunningTotalByRegion('NORTH'),
            'NORTH region subtotal should be 600');
    end;

    [Test]
    procedure TestMultipleProductSalesAccumulation()
    begin
        // [SCENARIO] Same product sold multiple times accumulates quantity
        // [GIVEN] Same product sold by different customers
        MockCalculator.Initialize();
        MockCalculator.AddSalesLine('CUST001', 'EAST', 'ITEM001', 10, 100);
        MockCalculator.AddSalesLine('CUST002', 'WEST', 'ITEM001', 25, 250);
        MockCalculator.AddSalesLine('CUST003', 'EAST', 'ITEM001', 15, 150);

        // [WHEN] We check product quantity
        // [THEN] Quantities are accumulated
        Assert.AreEqual(50, MockCalculator.GetProductSalesQuantity('ITEM001'),
            'ITEM001 total quantity should be 50');
    end;
}
